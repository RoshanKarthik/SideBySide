import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as Y from 'yjs';

/** One Yjs update as the room received it. */
export interface ReplayUpdate {
  /** Monotonic id assigned by the room's storage. */
  id: number;
  /** Server time (ms since epoch). Client clocks are never used for ordering. */
  ts: number;
  participantId: string | null;
  update: Uint8Array;
}

/** Full document state after every update up to and including `afterUpdateId`. */
export interface ReplaySnapshot {
  ts: number;
  afterUpdateId: number;
  state: Uint8Array;
}

export interface ReplayLog {
  snapshots: ReplaySnapshot[];
  updates: ReplayUpdate[];
}

const FORMAT_VERSION = 1;

export function encodeReplayLog(log: ReplayLog): Uint8Array {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, FORMAT_VERSION);
  encoding.writeVarUint(enc, log.snapshots.length);
  for (const s of log.snapshots) {
    encoding.writeFloat64(enc, s.ts);
    encoding.writeVarUint(enc, s.afterUpdateId);
    encoding.writeVarUint8Array(enc, s.state);
  }
  encoding.writeVarUint(enc, log.updates.length);
  for (const u of log.updates) {
    encoding.writeVarUint(enc, u.id);
    encoding.writeFloat64(enc, u.ts);
    encoding.writeVarString(enc, u.participantId ?? '');
    encoding.writeVarUint8Array(enc, u.update);
  }
  return encoding.toUint8Array(enc);
}

export function decodeReplayLog(data: Uint8Array): ReplayLog {
  const dec = decoding.createDecoder(data);
  const version = decoding.readVarUint(dec);
  if (version !== FORMAT_VERSION) throw new Error(`Unsupported replay format ${version}`);
  const snapshots: ReplaySnapshot[] = [];
  const snapshotCount = decoding.readVarUint(dec);
  for (let i = 0; i < snapshotCount; i++) {
    snapshots.push({
      ts: decoding.readFloat64(dec),
      afterUpdateId: decoding.readVarUint(dec),
      state: decoding.readVarUint8Array(dec),
    });
  }
  const updates: ReplayUpdate[] = [];
  const updateCount = decoding.readVarUint(dec);
  for (let i = 0; i < updateCount; i++) {
    const id = decoding.readVarUint(dec);
    const ts = decoding.readFloat64(dec);
    const participantId = decoding.readVarString(dec) || null;
    updates.push({ id, ts, participantId, update: decoding.readVarUint8Array(dec) });
  }
  return { snapshots, updates };
}

/**
 * Rebuilds the shared document at any moment of a session. Playing forward applies only the
 * new updates; seeking backwards restarts from the nearest snapshot at or before the target.
 */
export class ReplayCursor {
  private readonly snapshots: ReplaySnapshot[];
  private readonly updates: ReplayUpdate[];
  private docValue = new Y.Doc();
  /** Index of the next update to apply. */
  private next = 0;
  private time = Number.NEGATIVE_INFINITY;
  /** Incremented every time the document is replaced, so views can rebind. */
  generation = 0;

  constructor(log: ReplayLog) {
    this.snapshots = [...log.snapshots].sort((a, b) => a.ts - b.ts);
    this.updates = [...log.updates].sort((a, b) => a.id - b.id);
  }

  get doc(): Y.Doc {
    return this.docValue;
  }

  get currentTime(): number {
    return this.time;
  }

  /** Moves to time `t`; returns true when the document object was replaced. */
  seek(t: number): boolean {
    if (t >= this.time) {
      this.applyUntil(t);
      this.time = t;
      return false;
    }
    this.rebuild(t);
    return true;
  }

  private rebuild(t: number): void {
    this.docValue.destroy();
    this.docValue = new Y.Doc();
    this.generation++;
    let snapshot: ReplaySnapshot | undefined;
    for (const s of this.snapshots) {
      if (s.ts > t) break;
      snapshot = s;
    }
    const afterId = snapshot?.afterUpdateId ?? 0;
    if (snapshot) Y.applyUpdate(this.docValue, snapshot.state, 'replay');
    this.next = this.updates.findIndex((u) => u.id > afterId);
    if (this.next === -1) this.next = this.updates.length;
    this.applyUntil(t);
    this.time = t;
  }

  private applyUntil(t: number): void {
    const pending: Uint8Array[] = [];
    while (this.next < this.updates.length) {
      const u = this.updates[this.next];
      if (!u || u.ts > t) break;
      pending.push(u.update);
      this.next++;
    }
    if (pending.length === 1 && pending[0]) Y.applyUpdate(this.docValue, pending[0], 'replay');
    else if (pending.length > 1) Y.applyUpdate(this.docValue, Y.mergeUpdates(pending), 'replay');
  }
}
