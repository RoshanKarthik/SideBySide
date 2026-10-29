import {
  asc,
  codeRuns,
  connectDb,
  eq,
  events,
  participants,
  rubricScores,
  testCases,
  type Database,
} from '@sidebyside/db';
import {
  LANGUAGE_INFO,
  LIMITS,
  SNAPSHOT_INTERVAL_MS,
  clientMessageSchema,
  eventVisibility,
  isInterviewerRole,
  parseRoomDocumentName,
  roomDocumentName,
  type BoardFile,
  type ClientMessage,
  type EventType,
  type Lang,
  type RoomEvent,
  type RunRecord,
  type ServerMessage,
} from '@sidebyside/shared';
import {
  getCodeMap,
  getHints,
  getNotes,
  getRubric,
  initializeSharedDoc,
  notesToText,
  readProblem,
  showQuestionInDoc,
  type SharedProblem,
} from '@sidebyside/shared/doc';
import { encodeReplayLog, type ReplaySnapshot, type ReplayUpdate } from '@sidebyside/shared/replay';
import { getServerByName, type Connection, type ConnectionContext, type Server } from 'partyserver';
import { YServer } from 'y-partyserver';
import * as Y from 'yjs';
import { providerFromEnv } from '../ai/provider';
import { runReportJob, type DocTexts } from '../ai/summary';
import { canRecordRun, type DocumentPart } from '../auth/permissions';
import type { Actor, BoardFileResult } from '../context';
import { CLOSE_CODES, CONNECTION_HEADER, type ConnectionInfo } from './protocol';
import { buildTestRuns, type StoredTest } from './test-results';

const FLUSH_INTERVAL_MS = 2_000;
const FLUSH_MAX_UPDATES = 200;
const CLIENT_EVENTS_PER_MINUTE = 60;
const TEST_RUNS_PER_MINUTE = 5;
/** Offers, answers and ICE candidates for up to a few call peers, with room for renegotiation. */
const RTC_SIGNALS_PER_MINUTE = 1_200;
/** Long enough for the interviewer's browser to load Python on a slow connection. */
const TEST_REQUEST_TIMEOUT_MS = 120_000;

interface PendingUpdate {
  ts: number;
  participantId: string | null;
  update: Uint8Array;
}

interface ConnectionState {
  sbs?: ConnectionInfo;
  /** This tab's id in the video call, once it has joined. */
  callId?: string;
}

interface PendingTestRequest {
  requestId: string;
  questionId: string;
  language: Lang;
  requester: ConnectionInfo;
  requesterConnectionId: string;
  runnerConnectionId: string;
  timer: ReturnType<typeof setTimeout>;
}

export interface ShowQuestionInput {
  problem: SharedProblem;
  starterCode: Partial<Record<Lang, string>>;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function infoOf(connection: unknown): ConnectionInfo | null {
  if (!connection || typeof connection !== 'object' || !('state' in connection)) return null;
  return (connection as Connection<ConnectionState>).state?.sbs ?? null;
}

function callIdOf(connection: Connection): string | undefined {
  return (connection as Connection<ConnectionState>).state?.callId;
}

/** Sliding one-minute window rate limiter, per key. */
/**
 * Runs (and test cases) a participant may send to the server-side code runner per minute: it is
 * a free public service, so the room keeps its use modest.
 */
const SERVER_RUNS_PER_MINUTE = 20;

class MinuteLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly perMinute: number) {}
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= this.perMinute) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

/**
 * One Durable Object per room document (`<roomId>--shared` for everyone, `<roomId>--private`
 * for interviewers). It syncs the Yjs document between participants and keeps every update
 * with a server timestamp (plus a snapshot every minute) for replay.
 */
export class Room extends YServer {
  static override options = { hibernate: true };

  private pending: PendingUpdate[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSnapshotTs = 0;
  private ended = false;
  private locked = false;
  private runCount = 0;
  private runLimiter = new MinuteLimiter(LIMITS.runsPerMinute);
  private testLimiter = new MinuteLimiter(TEST_RUNS_PER_MINUTE);
  private eventLimiter = new MinuteLimiter(CLIENT_EVENTS_PER_MINUTE);
  private rtcLimiter = new MinuteLimiter(RTC_SIGNALS_PER_MINUTE);
  private executeLimiter = new MinuteLimiter(SERVER_RUNS_PER_MINUTE);
  private testRequests = new Map<string, PendingTestRequest>();

  private get store() {
    return this.ctx.storage.sql;
  }

  private get target() {
    const parsed = parseRoomDocumentName(this.name);
    if (!parsed) throw new Error(`Bad room document name: ${this.name}`);
    return parsed;
  }

  private get part(): DocumentPart {
    return this.target.part;
  }

  private get roomId(): string {
    return this.target.roomId;
  }

  /** Practice rooms record each round in its own documents. */
  private get round(): number {
    return this.target.round;
  }

  override async onLoad(): Promise<void> {
    this.store.exec(`CREATE TABLE IF NOT EXISTS updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      participant_id TEXT,
      data BLOB NOT NULL
    )`);
    this.store.exec(`CREATE TABLE IF NOT EXISTS snapshots (
      ts INTEGER NOT NULL,
      after_update_id INTEGER NOT NULL,
      state BLOB NOT NULL
    )`);
    this.store.exec(
      `CREATE TABLE IF NOT EXISTS room_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    );
    // Whiteboard images, kept out of the Yjs document so snapshots don't copy them.
    this.store.exec(`CREATE TABLE IF NOT EXISTS board_files (
      id TEXT PRIMARY KEY,
      mime_type TEXT NOT NULL,
      data_url TEXT NOT NULL,
      created INTEGER NOT NULL
    )`);

    this.ended = this.readMeta('ended') === 'true';
    this.locked = this.readMeta('locked') === 'true';
    this.runCount = Number(this.readMeta('runCount') ?? 0);

    // Rebuild the document: latest snapshot, then every update stored after it.
    const snapshot = this.store
      .exec<{ ts: number; after_update_id: number; state: ArrayBuffer }>(
        'SELECT ts, after_update_id, state FROM snapshots ORDER BY after_update_id DESC LIMIT 1',
      )
      .toArray()[0];
    const parts: Uint8Array[] = [];
    if (snapshot) {
      parts.push(new Uint8Array(snapshot.state));
      this.lastSnapshotTs = snapshot.ts;
    }
    for (const row of this.store.exec<{ data: ArrayBuffer }>(
      'SELECT data FROM updates WHERE id > ? ORDER BY id',
      snapshot?.after_update_id ?? 0,
    )) {
      parts.push(new Uint8Array(row.data));
    }
    if (parts.length) Y.applyUpdate(this.document, Y.mergeUpdates(parts));
  }

  override async onStart(): Promise<void> {
    await super.onStart();
    // Registered after loading, so only new changes are recorded.
    this.document.on('update', (update: Uint8Array, origin: unknown) => {
      this.pending.push({
        ts: Date.now(),
        participantId: infoOf(origin)?.participantId ?? null,
        update,
      });
      if (this.pending.length >= FLUSH_MAX_UPDATES) this.flush();
      else this.flushTimer ??= setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
    });
  }

  override async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    const raw = ctx.request.headers.get(CONNECTION_HEADER);
    const info = raw ? (JSON.parse(raw) as ConnectionInfo) : null;
    // The Worker already checked this; refusing here too keeps the private document safe
    // even if routing changes.
    if (!info || (this.part === 'private' && !isInterviewerRole(info.role))) {
      connection.close(CLOSE_CODES.unauthorized, 'Unauthorized');
      return;
    }
    if (this.ended) {
      connection.close(CLOSE_CODES.sessionEnded, 'Session ended');
      return;
    }
    connection.setState((prev: ConnectionState | null) => ({ ...prev, sbs: info }));
    // Creates the per-language buffers once, on the server, before anyone edits.
    if (this.part === 'shared') initializeSharedDoc(this.document, info.defaultLanguage);
    await super.onConnect(connection, ctx);

    if (this.part === 'shared') {
      this.send(connection, { kind: 'lock_state', locked: this.locked });
      if (this.connectionsOf(info.participantId, connection.id) === 0) {
        void this.recordEvent(info, 'participant_joined', { displayName: info.displayName });
      }
    }
  }

  override async onClose(
    connection: Connection,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    await super.onClose(connection, code, reason, wasClean);
    const info = infoOf(connection);
    if (
      info &&
      this.part === 'shared' &&
      !this.ended &&
      this.connectionsOf(info.participantId, connection.id) === 0
    ) {
      void this.recordEvent(info, 'participant_left', { displayName: info.displayName });
      void this.withDb((db) =>
        db
          .update(participants)
          .set({ leftAt: new Date() })
          .where(eq(participants.id, info.participantId)),
      );
    }
    for (const req of this.testRequests.values()) {
      if (req.runnerConnectionId === connection.id) {
        this.failTestRequest(req, 'The interviewer running the tests disconnected.');
      }
    }
    if (this.openConnectionCount(connection.id) === 0) this.flush();
  }

  /** Read-only after the session ends, and for candidates while the interviewer has locked it. */
  override isReadOnly(connection: Connection): boolean {
    if (this.ended) return true;
    const info = infoOf(connection);
    return this.locked && !(info && isInterviewerRole(info.role));
  }

  override onCustomMessage(connection: Connection, message: string): void {
    const info = infoOf(connection);
    if (!info) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return this.sendError(connection, 'bad_message', 'Malformed message');
    }
    const result = clientMessageSchema.safeParse(parsed);
    if (!result.success) return this.sendError(connection, 'bad_message', 'Invalid message');
    if (this.ended) return this.sendError(connection, 'session_ended', 'The session has ended');
    void this.handle(connection, info, result.data);
  }

  private async handle(connection: Connection, info: ConnectionInfo, msg: ClientMessage) {
    const interviewer = isInterviewerRole(info.role);
    switch (msg.kind) {
      case 'event': {
        if (!this.eventLimiter.allow(info.participantId)) return;
        // Interviewer note timestamps belong to the private document only.
        const privateEvent = msg.event.type === 'note_timestamp';
        if (privateEvent !== (this.part === 'private')) return;
        return this.recordEvent(info, msg.event.type, msg.event.payload);
      }
      case 'code_run':
        if (this.part !== 'shared') return;
        return this.recordRun(connection, info, msg.run);
      case 'set_lock':
        if (this.part !== 'shared') return;
        if (!interviewer)
          return this.sendError(connection, 'forbidden', 'Only interviewers can lock the editor');
        return this.setLock(info, msg.locked);
      case 'run_tests':
        if (this.part !== 'shared') return;
        return this.requestTests(connection, info, msg.requestId, msg.questionId, msg.language);
      case 'tests_result':
        if (this.part !== 'shared' || !interviewer) return;
        return this.completeTests(connection, msg.requestId, msg.source, msg.outcomes);
      case 'rtc':
        if (this.part !== 'shared') return;
        return this.relaySignal(connection, info, msg);
    }
  }

  // ---------------------------------------------------------------------------
  // Video call signalling
  // ---------------------------------------------------------------------------

  /**
   * Passes WebRTC offers, answers and ICE candidates from one call participant to another.
   * Media itself goes directly between browsers and never reaches the server. A call id
   * belongs to the first connection that uses it, so nobody can take over another tab's id.
   */
  private relaySignal(
    connection: Connection,
    info: ConnectionInfo,
    msg: Extract<ClientMessage, { kind: 'rtc' }>,
  ) {
    if (!this.rtcLimiter.allow(info.participantId)) return;
    const owner = this.callConnection(msg.from);
    if (owner && owner.id !== connection.id) {
      return this.sendError(connection, 'call_id_taken', 'Rejoin the call to continue.');
    }
    if (callIdOf(connection) !== msg.from) {
      connection.setState((prev: ConnectionState | null) => ({ ...prev, callId: msg.from }));
    }
    if (!msg.to || !msg.signal) return;
    const target = this.callConnection(msg.to);
    if (target) this.send(target, { kind: 'rtc', from: msg.from, signal: msg.signal });
  }

  private callConnection(callId: string): Connection | undefined {
    for (const c of this.getConnections()) {
      if (callIdOf(c) === callId) return c;
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // RPC (called by the Worker after its own permission checks)
  // ---------------------------------------------------------------------------

  async end(): Promise<void> {
    if (this.part === 'private') await this.persistRubric();
    this.flush();
    this.writeSnapshot(this.lastUpdateId());
    this.ended = true;
    this.writeMeta('ended', 'true');
    for (const req of this.testRequests.values()) clearTimeout(req.timer);
    this.testRequests.clear();
    this.broadcastMessage({ kind: 'session_ended' });
    for (const connection of this.getConnections()) {
      connection.close(CLOSE_CODES.sessionEnded, 'Session ended');
    }
  }

  /**
   * Practice: this round is over and the next one starts in fresh documents. Everyone is
   * disconnected with a code that tells the client to reconnect to the new round.
   */
  async closeRound(nextRound: number): Promise<void> {
    if (this.ended) return;
    if (this.part === 'private') await this.persistRubric();
    this.flush();
    this.writeSnapshot(this.lastUpdateId());
    this.ended = true;
    this.writeMeta('ended', 'true');
    for (const req of this.testRequests.values()) clearTimeout(req.timer);
    this.testRequests.clear();
    this.broadcastMessage({ kind: 'round_changed', round: nextRound });
    for (const connection of this.getConnections()) {
      connection.close(CLOSE_CODES.roundChanged, 'Next round');
    }
  }

  // ---------------------------------------------------------------------------
  // AI post-interview reports
  // ---------------------------------------------------------------------------

  /**
   * Writes this round's reports in the background (shared document only): an alarm runs the
   * job, so it survives this request ending and is retried if it fails unexpectedly.
   */
  async generateReports(): Promise<void> {
    if (this.part !== 'shared') return;
    await this.ctx.storage.setAlarm(Date.now() + 500);
  }

  /** The notes of this document as plain text (shared notes, or the private notes). */
  async notesText(): Promise<string> {
    return notesToText(getNotes(this.document));
  }

  override async onAlarm(): Promise<void> {
    if (this.part !== 'shared') return;
    const provider = providerFromEnv(this.env as unknown as Parameters<typeof providerFromEnv>[0]);
    if (!provider) return;
    const { roomId, round } = this;
    const privateDoc = (await getServerByName(
      this.env.Room as unknown as DurableObjectNamespace<Server>,
      roomDocumentName(roomId, 'private', round),
    )) as unknown as DurableObjectStub<Room>;
    const docs: DocTexts = {
      sharedNotes: notesToText(getNotes(this.document)),
      privateNotes: await privateDoc.notesText(),
      code: this.writtenCode(),
    };
    const handle = await connectDb(this.env.HYPERDRIVE.connectionString);
    try {
      await runReportJob({ db: handle.db, provider, roomId, round, docs });
    } finally {
      await handle.close();
    }
  }

  /** Code per language that differs from the starter (and isn't empty). */
  private writtenCode(): DocTexts['code'] {
    const loaded = (this.document.getMap('meta').get('loadedStarters') ?? {}) as Record<
      string,
      string
    >;
    const code: DocTexts['code'] = {};
    for (const [lang, text] of getCodeMap(this.document).entries()) {
      const source = text.toString();
      const starter = LANGUAGE_INFO[lang as Lang]?.starter;
      if (!starter || !source.trim() || source === starter || source === loaded[lang]) continue;
      code[lang as Lang] = source;
    }
    return code;
  }

  /** Deletes everything this document stored (session or account deletion). */
  async purge(): Promise<void> {
    for (const req of this.testRequests.values()) clearTimeout(req.timer);
    this.testRequests.clear();
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.pending = [];
    this.ended = true;
    for (const connection of this.getConnections()) {
      connection.close(CLOSE_CODES.sessionEnded, 'Session deleted');
    }
    await this.ctx.storage.deleteAll();
  }

  async showQuestion(actor: Actor, input: ShowQuestionInput): Promise<void> {
    if (this.ended || this.part !== 'shared') return;
    showQuestionInDoc(this.document, input.problem, input.starterCode);
    await this.recordEvent(actor, 'question_shown', {
      questionId: input.problem.questionId,
      title: input.problem.title,
    });
  }

  async revealHint(
    actor: Actor,
    questionId: string,
    index: number,
    text: string,
  ): Promise<boolean> {
    if (this.ended || this.part !== 'shared') return false;
    if (readProblem(this.document)?.questionId !== questionId) return false;
    const hints = getHints(this.document);
    if (hints.toArray().some((h) => h.index === index)) return true;
    hints.push([{ index, text }]);
    await this.recordEvent(actor, 'hint_revealed', { questionId, hintIndex: index });
    return true;
  }

  async putBoardFile(file: BoardFile, fromInterviewer: boolean): Promise<BoardFileResult> {
    if (this.ended) return 'ended';
    if (this.locked && !fromInterviewer) return 'locked';
    const exists = this.store
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM board_files WHERE id = ?', file.id)
      .one().n;
    if (exists) return 'stored';
    const count = this.store.exec<{ n: number }>('SELECT COUNT(*) AS n FROM board_files').one().n;
    if (count >= LIMITS.boardImagesPerDocument) return 'full';
    this.store.exec(
      'INSERT INTO board_files (id, mime_type, data_url, created) VALUES (?, ?, ?, ?)',
      file.id,
      file.mimeType,
      file.dataURL,
      file.created,
    );
    return 'stored';
  }

  async getBoardFile(id: string): Promise<BoardFile | null> {
    const row = this.store
      .exec<{ id: string; mime_type: string; data_url: string; created: number }>(
        'SELECT id, mime_type, data_url, created FROM board_files WHERE id = ?',
        id,
      )
      .toArray()[0];
    return row
      ? {
          id: row.id,
          mimeType: row.mime_type as BoardFile['mimeType'],
          dataURL: row.data_url,
          created: row.created,
        }
      : null;
  }

  async allowExecution(participantId: string): Promise<'ok' | 'ended' | 'limited'> {
    if (this.ended) return 'ended';
    return this.executeLimiter.allow(participantId) ? 'ok' : 'limited';
  }

  async getReplayLog(): Promise<Uint8Array> {
    this.flush();
    const snapshots: ReplaySnapshot[] = this.store
      .exec<{ ts: number; after_update_id: number; state: ArrayBuffer }>(
        'SELECT ts, after_update_id, state FROM snapshots ORDER BY after_update_id',
      )
      .toArray()
      .map((r) => ({ ts: r.ts, afterUpdateId: r.after_update_id, state: new Uint8Array(r.state) }));
    const updates: ReplayUpdate[] = this.store
      .exec<{ id: number; ts: number; participant_id: string | null; data: ArrayBuffer }>(
        'SELECT id, ts, participant_id, data FROM updates ORDER BY id',
      )
      .toArray()
      .map((r) => ({
        id: r.id,
        ts: r.ts,
        participantId: r.participant_id,
        update: new Uint8Array(r.data),
      }));
    return encodeReplayLog({ snapshots, updates });
  }

  // ---------------------------------------------------------------------------
  // Editor lock
  // ---------------------------------------------------------------------------

  private async setLock(info: ConnectionInfo, locked: boolean) {
    if (this.locked === locked) return;
    this.locked = locked;
    this.writeMeta('locked', String(locked));
    this.broadcastMessage({ kind: 'lock_state', locked });
    await this.recordEvent(info, locked ? 'editor_locked' : 'editor_unlocked', {});
  }

  // ---------------------------------------------------------------------------
  // Tests: run in an interviewer's browser, filtered here by role
  // ---------------------------------------------------------------------------

  private requestTests(
    connection: Connection,
    info: ConnectionInfo,
    requestId: string,
    questionId: string,
    language: Lang,
  ) {
    const fail = (message: string) =>
      this.send(connection, { kind: 'tests_failed', requestId, message });
    if (readProblem(this.document)?.questionId !== questionId) {
      return fail('That question is no longer the active one.');
    }
    if (!this.testLimiter.allow(info.participantId)) {
      return fail(`Up to ${TEST_RUNS_PER_MINUTE} test runs a minute.`);
    }
    if (this.testRequests.has(requestId)) return;
    // Prefer the requester if they are an interviewer; otherwise any connected interviewer.
    let runner: Connection | undefined;
    if (isInterviewerRole(info.role)) runner = connection;
    else {
      for (const c of this.getConnections()) {
        const ci = infoOf(c);
        if (ci && isInterviewerRole(ci.role)) {
          runner = c;
          break;
        }
      }
    }
    if (!runner) {
      return fail('Tests run in the interviewer’s browser, and no interviewer is connected.');
    }
    const req: PendingTestRequest = {
      requestId,
      questionId,
      language,
      requester: info,
      requesterConnectionId: connection.id,
      runnerConnectionId: runner.id,
      timer: setTimeout(() => {
        const pending = this.testRequests.get(requestId);
        if (pending) this.failTestRequest(pending, 'The test run took too long.');
      }, TEST_REQUEST_TIMEOUT_MS),
    };
    this.testRequests.set(requestId, req);
    this.send(runner, {
      kind: 'tests_requested',
      requestId,
      questionId,
      language,
      requestedByName: info.displayName,
    });
  }

  private failTestRequest(req: PendingTestRequest, message: string) {
    clearTimeout(req.timer);
    this.testRequests.delete(req.requestId);
    const requester = this.getConnection(req.requesterConnectionId);
    if (requester)
      this.send(requester, { kind: 'tests_failed', requestId: req.requestId, message });
  }

  private async completeTests(
    connection: Connection,
    requestId: string,
    source: string,
    outcomes: Parameters<typeof buildTestRuns>[1],
  ) {
    const req = this.testRequests.get(requestId);
    if (!req || req.runnerConnectionId !== connection.id) return;
    clearTimeout(req.timer);
    this.testRequests.delete(requestId);

    const tests = await this.queryDb((db) =>
      db
        .select({
          id: testCases.id,
          stdin: testCases.stdin,
          expectedStdout: testCases.expectedStdout,
          isHidden: testCases.isHidden,
          weight: testCases.weight,
        })
        .from(testCases)
        .where(eq(testCases.questionId, req.questionId))
        .orderBy(asc(testCases.sortOrder)),
    );
    if (!tests) return this.failTestRequest(req, 'Could not load the tests.');

    const serverTs = Date.now();
    const { full, candidate } = buildTestRuns(tests as StoredTest[], outcomes, {
      requestId,
      questionId: req.questionId,
      questionTitle: readProblem(this.document)?.title ?? '',
      language: req.language,
      requestedBy: req.requester.displayName,
      serverTs,
    });
    // Hidden test contents go only to interviewers.
    for (const c of this.getConnections()) {
      const ci = infoOf(c);
      if (!ci) continue;
      this.send(c, {
        kind: 'tests_result',
        run: isInterviewerRole(ci.role) ? full : candidate,
      });
    }

    await this.withDb((db) =>
      db.insert(codeRuns).values({
        roomId: req.requester.roomId,
        participantId: req.requester.participantId,
        language: req.language,
        sourceCode: source,
        stdin: '',
        kind: 'tests',
        questionId: req.questionId,
        status: full.passed === full.total ? 'ok' : 'error',
        testsPassed: full.passed,
        testsTotal: full.total,
        score: full.score,
        details: full.results,
        serverTs: new Date(serverTs),
      }),
    );
    await this.recordEvent(req.requester, 'tests_run', {
      questionId: req.questionId,
      language: req.language,
      passed: full.passed,
      total: full.total,
      score: full.score,
    });
  }

  // ---------------------------------------------------------------------------
  // Rubric (private document)
  // ---------------------------------------------------------------------------

  private async persistRubric() {
    const entries = [...getRubric(this.document).entries()];
    if (!entries.length) return;
    const roomId = this.roomId;
    await this.withDb(async (db) => {
      for (const [criterion, entry] of entries) {
        const score =
          typeof entry.score === 'number' && entry.score >= 1 && entry.score <= 4
            ? entry.score
            : null;
        const comment = typeof entry.comment === 'string' ? entry.comment.slice(0, 2000) : '';
        await db
          .insert(rubricScores)
          .values({
            roomId,
            roundNumber: this.round,
            criterion: criterion.slice(0, 120),
            score,
            comment,
          })
          .onConflictDoUpdate({
            target: [rubricScores.roomId, rubricScores.roundNumber, rubricScores.criterion],
            set: { score, comment },
          });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  /** Writes buffered updates, merging consecutive ones from the same person into one row. */
  private flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.pending.length) return;
    const batch = this.pending;
    this.pending = [];

    const groups: PendingUpdate[][] = [];
    for (const item of batch) {
      const last = groups.at(-1);
      if (last && last[0]?.participantId === item.participantId) last.push(item);
      else groups.push([item]);
    }
    let lastId = 0;
    for (const group of groups) {
      const data =
        group.length === 1 ? group[0]!.update : Y.mergeUpdates(group.map((g) => g.update));
      const row = this.store
        .exec<{ id: number }>(
          'INSERT INTO updates (ts, participant_id, data) VALUES (?, ?, ?) RETURNING id',
          group.at(-1)!.ts,
          group[0]!.participantId,
          toArrayBuffer(data),
        )
        .one();
      lastId = row.id;
    }
    if (Date.now() - this.lastSnapshotTs >= SNAPSHOT_INTERVAL_MS) this.writeSnapshot(lastId);
  }

  private writeSnapshot(afterUpdateId: number): void {
    const ts = Date.now();
    this.store.exec(
      'INSERT INTO snapshots (ts, after_update_id, state) VALUES (?, ?, ?)',
      ts,
      afterUpdateId,
      toArrayBuffer(Y.encodeStateAsUpdate(this.document)),
    );
    this.lastSnapshotTs = ts;
  }

  private lastUpdateId(): number {
    return (
      this.store.exec<{ id: number | null }>('SELECT MAX(id) AS id FROM updates').one().id ?? 0
    );
  }

  private readMeta(key: string): string | null {
    return (
      this.store
        .exec<{ value: string }>('SELECT value FROM room_meta WHERE key = ?', key)
        .toArray()[0]?.value ?? null
    );
  }

  private writeMeta(key: string, value: string): void {
    this.store.exec(
      'INSERT INTO room_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value,
    );
  }

  // ---------------------------------------------------------------------------
  // Events and runs
  // ---------------------------------------------------------------------------

  private async recordEvent(
    actor: Actor,
    type: EventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const serverTs = Date.now();
    const visibility = eventVisibility(type);
    const event: RoomEvent = {
      id: `${serverTs}-${crypto.randomUUID().slice(0, 8)}`,
      type,
      participantId: actor.participantId,
      payload,
      serverTs,
    };
    // Everyone on the private document is an interviewer; on the shared one, only events
    // visible to all are broadcast.
    if (visibility === 'all' || this.part === 'private')
      this.broadcastMessage({ kind: 'event', event });
    await this.withDb((db) =>
      db.insert(events).values({
        roomId: actor.roomId,
        roundNumber: this.round,
        participantId: actor.participantId,
        type,
        payload,
        visibility,
        serverTs: new Date(serverTs),
      }),
    );
  }

  private async recordRun(connection: Connection, info: ConnectionInfo, run: RunRecord) {
    if (!canRecordRun({ status: this.ended ? 'ended' : 'live' })) return;
    if (!this.runLimiter.allow(info.participantId)) {
      return this.sendError(
        connection,
        'rate_limited',
        `Up to ${LIMITS.runsPerMinute} runs a minute`,
      );
    }
    if (this.runCount >= LIMITS.runsPerRoom) {
      return this.sendError(connection, 'rate_limited', 'This session has reached its run limit');
    }
    this.runCount++;
    this.writeMeta('runCount', String(this.runCount));

    const serverTs = Date.now();
    this.broadcastMessage({
      kind: 'run_result',
      run: {
        runId: run.runId,
        language: run.language,
        status: run.status,
        stdout: run.stdout,
        stderr: run.stderr,
        exitCode: run.exitCode,
        timeMs: run.timeMs,
        memoryKb: run.memoryKb,
        participantId: info.participantId,
        displayName: info.displayName,
        serverTs,
      },
    });
    await this.withDb((db) =>
      db.insert(codeRuns).values({
        roomId: info.roomId,
        participantId: info.participantId,
        language: run.language,
        sourceCode: run.source,
        stdin: run.stdin,
        kind: 'run',
        status: run.status,
        stdout: run.stdout,
        stderr: run.stderr,
        exitCode: run.exitCode,
        timeMs: run.timeMs,
        memoryKb: run.memoryKb,
        serverTs: new Date(serverTs),
      }),
    );
    await this.recordEvent(info, 'code_run', {
      runId: run.runId,
      language: run.language,
      status: run.status,
      timeMs: run.timeMs,
      memoryKb: run.memoryKb,
      stdoutPreview: run.stdout.slice(0, LIMITS.eventPreviewChars),
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private broadcastMessage(message: ServerMessage): void {
    this.broadcastCustomMessage(JSON.stringify(message));
  }

  private send(connection: Connection, message: ServerMessage): void {
    this.sendCustomMessage(connection, JSON.stringify(message));
  }

  private sendError(connection: Connection, code: string, message: string): void {
    this.send(connection, { kind: 'error', code, message });
  }

  private connectionsOf(participantId: string, excludeId: string): number {
    let n = 0;
    for (const c of this.getConnections()) {
      if (c.id !== excludeId && infoOf(c)?.participantId === participantId) n++;
    }
    return n;
  }

  private openConnectionCount(excludeId: string): number {
    let n = 0;
    for (const c of this.getConnections()) if (c.id !== excludeId) n++;
    return n;
  }

  private async queryDb<T>(fn: (db: Database) => Promise<T>): Promise<T | null> {
    try {
      const handle = await connectDb(this.env.HYPERDRIVE.connectionString);
      try {
        return await fn(handle.db);
      } finally {
        await handle.close();
      }
    } catch (err) {
      console.error('Room database query failed', err);
      return null;
    }
  }

  private async withDb(fn: (db: Database) => Promise<unknown>): Promise<void> {
    await this.queryDb(fn);
  }
}
