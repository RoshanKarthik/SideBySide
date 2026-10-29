import {
  and,
  asc,
  codeRuns,
  desc,
  eq,
  events,
  inArray,
  questions,
  rooms,
  rubricScores,
  sessionReports,
  sessionRounds,
  type Database,
} from '@sidebyside/db';
import {
  LANGUAGE_INFO,
  candidateReportSchema,
  interviewerReportSchema,
  type Lang,
  type ReportKind,
} from '@sidebyside/shared';
import { z } from 'zod';
import type { SummaryProvider } from './provider';

/** Text the room's live documents hold when the session ends. */
export interface DocTexts {
  sharedNotes: string;
  privateNotes: string;
  /** Code per language the candidate actually wrote in (starter code left out). */
  code: Partial<Record<Lang, string>>;
}

// Caps keep a report's prompt to a few thousand tokens, well inside the free tier.
const MAX_CODE_CHARS = 6_000;
const MAX_NOTES_CHARS = 3_000;
const MAX_DESCRIPTION_CHARS = 1_500;
const MAX_RUNS = 8;
const MAX_TIMELINE = 40;
const MAX_ERROR_CHARS = 300;

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}\n…(cut)` : s);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clock = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Collects what the reports are written from: the questions, the final code, runs and tests,
 * notes, hints, activity signals and (interviewer report only) private notes and rubric, as
 * one plain-text brief per report.
 */
export async function buildBriefs(
  db: Database,
  roomId: string,
  round: number,
  docs: DocTexts,
): Promise<{ interviewer: string; candidate: string }> {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) throw new Error('Room not found');
  const [[roundRow], evs, runs, rubric] = await Promise.all([
    db
      .select()
      .from(sessionRounds)
      .where(and(eq(sessionRounds.roomId, roomId), eq(sessionRounds.roundNumber, round))),
    db
      .select()
      .from(events)
      .where(and(eq(events.roomId, roomId), eq(events.roundNumber, round)))
      .orderBy(asc(events.serverTs), asc(events.id))
      .limit(5_000),
    db
      .select()
      .from(codeRuns)
      .where(eq(codeRuns.roomId, roomId))
      .orderBy(desc(codeRuns.serverTs))
      .limit(200),
    db
      .select()
      .from(rubricScores)
      .where(and(eq(rubricScores.roomId, roomId), eq(rubricScores.roundNumber, round))),
  ]);

  // A practice room has two rounds; each report covers its own round's time.
  const start = (roundRow?.startedAt ?? room.startedAt ?? room.createdAt).getTime();
  const end =
    roundRow?.endedAt?.getTime() ??
    room.endedAt?.getTime() ??
    evs.at(-1)?.serverTs.getTime() ??
    start;
  const at = (d: Date) => clock(d.getTime() - start);
  const of = (type: string) => evs.filter((e) => e.type === type);

  // Questions, with their statements and how long each was the active one.
  const shown = of('question_shown');
  const questionIds = [...new Set(shown.map((e) => String(e.payload.questionId ?? '')))].filter(
    Boolean,
  );
  const questionRows = questionIds.length
    ? await db
        .select({
          id: questions.id,
          title: questions.title,
          difficulty: questions.difficulty,
          descriptionMd: questions.descriptionMd,
        })
        .from(questions)
        .where(inArray(questions.id, questionIds))
    : [];
  const questionLines = shown.map((e, i) => {
    const q = questionRows.find((r) => r.id === e.payload.questionId);
    const until = shown[i + 1]?.serverTs.getTime() ?? end;
    const minutes = Math.max(1, Math.round((until - e.serverTs.getTime()) / 60_000));
    return [
      `### ${q?.title ?? String(e.payload.title ?? 'Question')} (${q?.difficulty ?? 'unknown'}, shown at ${at(e.serverTs)}, about ${minutes} min)`,
      q?.descriptionMd ? clip(q.descriptionMd, MAX_DESCRIPTION_CHARS) : '',
    ].join('\n');
  });

  const roundRuns = runs
    .filter((r) => r.serverTs.getTime() >= start && r.serverTs.getTime() <= end)
    .slice(0, MAX_RUNS)
    .reverse();
  const runLines = roundRuns.map((r) => {
    const label =
      r.kind === 'tests'
        ? `tests ${r.testsPassed}/${r.testsTotal} passed${r.score !== null ? `, score ${r.score}/100` : ''}`
        : `run ${r.status}${r.stderr ? `, error: ${clip(r.stderr, MAX_ERROR_CHARS)}` : ''}`;
    return `- ${at(r.serverTs)} ${LANGUAGE_INFO[r.language].label}: ${label}`;
  });

  const codeBlocks = Object.entries(docs.code).map(
    ([lang, source]) =>
      `### ${LANGUAGE_INFO[lang as Lang].label}\n\`\`\`\n${clip(source ?? '', MAX_CODE_CHARS)}\n\`\`\``,
  );

  const hints = of('hint_revealed').map(
    (e) => `- ${at(e.serverTs)} hint ${num(e.payload.index) + 1}`,
  );
  const pastes = of('paste');
  const signals = [
    `pastes: ${pastes.length} (${pastes.reduce((s, e) => s + num(e.payload.chars), 0)} characters)`,
    `large inserts: ${of('large_insert').length}`,
    `switched tab: ${of('tab_hidden').length} times, ${Math.round(of('tab_visible').reduce((s, e) => s + num(e.payload.hiddenMs), 0) / 1000)} s away`,
    `left the window: ${of('window_blur').length} times`,
  ].join('; ');

  const timeline = evs
    .filter((e) =>
      [
        'question_shown',
        'hint_revealed',
        'tests_run',
        'code_run',
        'paste',
        'editor_locked',
      ].includes(e.type),
    )
    .slice(0, MAX_TIMELINE)
    .map((e) => `- ${at(e.serverTs)} ${e.type.replaceAll('_', ' ')}`);

  const common = [
    `# Session: ${room.title}`,
    `Mode: ${room.mode}${room.mode === 'practice' ? `, round ${round}` : ''}. Length: ${clock(end - start)}.`,
    '## Questions',
    questionLines.join('\n\n') || 'No question was shown from the bank.',
    '## Final code',
    codeBlocks.join('\n\n') || 'No code was written.',
    '## Runs and test runs (oldest first)',
    runLines.join('\n') || 'None.',
    '## Hints revealed',
    hints.join('\n') || 'None.',
    '## Shared notes (visible to everyone)',
    clip(docs.sharedNotes.trim(), MAX_NOTES_CHARS) || 'Empty.',
    '## Timeline',
    timeline.join('\n') || 'No events.',
  ];

  const interviewer = [
    ...common,
    '## Activity signals (neutral signals, not evidence of wrongdoing)',
    signals,
    '## Interviewer private notes',
    clip(docs.privateNotes.trim(), MAX_NOTES_CHARS) || 'Empty.',
    '## Interviewer rubric (1 poor – 4 excellent)',
    rubric.length
      ? rubric
          .map(
            (r) =>
              `- ${r.criterion}: ${r.score ?? 'not scored'}${r.comment ? ` — ${r.comment}` : ''}`,
          )
          .join('\n')
      : 'Not filled in.',
  ].join('\n\n');

  return { interviewer, candidate: common.join('\n\n') };
}

const SYSTEM: Record<ReportKind, string> = {
  interviewer: [
    'You are an experienced technical interviewer writing a structured debrief for the hiring team.',
    'Use only the session data you are given; when something is missing, say so instead of guessing.',
    'Activity signals are signals, never verdicts: describe them neutrally and never accuse the candidate.',
    'Suggested scores use 1 (poor) to 4 (excellent) for the rubric criteria, each with short reasoning.',
    'Times in keyMoments are mm:ss from the start of the session.',
    'Write in plain, professional English. Reply with one JSON object only.',
  ].join(' '),
  candidate: [
    'You are a supportive interview coach writing feedback for the candidate after a technical interview.',
    'Use only the session data you are given. Be specific, kind and practical.',
    'Explain a cleaner reference approach in words (short code is fine) and its time and space complexity.',
    'Write in plain English, addressing the candidate as "you". Reply with one JSON object only.',
  ].join(' '),
};

const SCHEMAS = { interviewer: interviewerReportSchema, candidate: candidateReportSchema };

/** Accepts the model's answer as an object or as text with a JSON object somewhere in it. */
function parseAnswer(raw: unknown): unknown {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first < 0 || last <= first) return null;
    try {
      return JSON.parse(raw.slice(first, last + 1));
    } catch {
      return null;
    }
  }
}

/** Asks for one report and validates it; an invalid answer gets one retry. */
export async function writeReport(
  provider: SummaryProvider,
  kind: ReportKind,
  brief: string,
): Promise<{ content: Record<string, unknown>; model: string }> {
  const schema = SCHEMAS[kind];
  const jsonSchema = z.toJSONSchema(schema);
  let problem = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const user = attempt
      ? `${brief}\n\nYour previous answer was not valid (${problem}). Reply again with JSON that matches the schema exactly.`
      : brief;
    const { answer, model } = await provider.complete({ system: SYSTEM[kind], user, jsonSchema });
    const result = schema.safeParse(parseAnswer(answer));
    if (result.success) return { content: result.data as Record<string, unknown>, model };
    problem = result.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || 'answer'}: ${i.message}`)
      .join('; ');
  }
  throw new Error(`The AI answer did not match the report format (${problem}).`);
}

/** Marks a round's reports as being written (new rows, or a regenerate). */
export async function markReportsPending(db: Database, roomId: string, round: number) {
  for (const kind of ['interviewer', 'candidate'] as const) {
    await db
      .insert(sessionReports)
      .values({ roomId, roundNumber: round, kind, status: 'pending' })
      .onConflictDoUpdate({
        target: [sessionReports.roomId, sessionReports.roundNumber, sessionReports.kind],
        set: { status: 'pending', error: null, updatedAt: new Date() },
      });
  }
}

/**
 * Writes both reports for a round and stores each as ready or failed (a failed one can be
 * regenerated from the session page). Only an unexpected error (the database) is thrown, so
 * the caller can retry the whole job.
 */
export async function runReportJob(options: {
  db: Database;
  provider: SummaryProvider;
  roomId: string;
  round: number;
  docs: DocTexts;
}): Promise<void> {
  const { db, provider, roomId, round, docs } = options;
  const briefs = await buildBriefs(db, roomId, round, docs);
  await Promise.all(
    (['interviewer', 'candidate'] as const).map(async (kind) => {
      let update: Partial<typeof sessionReports.$inferInsert>;
      try {
        const { content, model } = await writeReport(provider, kind, briefs[kind]);
        update = {
          status: 'ready',
          content,
          error: null,
          model,
          generatedAt: new Date(),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        update = { status: 'failed', error: message.slice(0, 500), model: provider.name };
      }
      await db
        .insert(sessionReports)
        .values({ roomId, roundNumber: round, kind, ...update })
        .onConflictDoUpdate({
          target: [sessionReports.roomId, sessionReports.roundNumber, sessionReports.kind],
          set: { ...update, updatedAt: new Date() },
        });
    }),
  );
}
