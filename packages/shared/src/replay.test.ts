import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { getCodeMap, initializeSharedDoc } from './doc';
import { ReplayCursor, decodeReplayLog, encodeReplayLog, type ReplayLog } from './replay';

/** Records a session the way the room does: every update with an id and a server time. */
function recordSession(): { log: ReplayLog; textAt: (t: number) => string } {
  const doc = new Y.Doc();
  const log: ReplayLog = { snapshots: [], updates: [] };
  let now = 1000;
  let id = 0;
  doc.on('update', (update: Uint8Array) => {
    log.updates.push({ id: ++id, ts: now, participantId: id % 2 ? 'p1' : null, update });
  });
  initializeSharedDoc(doc, 'python');
  const text = () => getCodeMap(doc).get('python')!;
  const history: Array<[number, string]> = [[now, text().toString()]];
  for (let i = 0; i < 20; i++) {
    now += 500;
    text().insert(0, `line${i}\n`);
    history.push([now, text().toString()]);
    if (i === 9) {
      log.snapshots.push({ ts: now, afterUpdateId: id, state: Y.encodeStateAsUpdate(doc) });
    }
  }
  const textAt = (t: number) => {
    let value = '';
    for (const [ts, v] of history) if (ts <= t) value = v;
    return value;
  };
  return { log, textAt };
}

describe('replay log', () => {
  it('round-trips through the binary encoding', () => {
    const { log } = recordSession();
    const decoded = decodeReplayLog(encodeReplayLog(log));
    expect(decoded.updates).toHaveLength(log.updates.length);
    expect(decoded.snapshots[0]?.afterUpdateId).toBe(log.snapshots[0]?.afterUpdateId);
    expect(decoded.updates[0]?.participantId).toBe('p1');
    expect(decoded.updates[1]?.participantId).toBeNull();
    expect(Array.from(decoded.updates[3]!.update)).toEqual(Array.from(log.updates[3]!.update));
  });

  it('rebuilds the document at any time, forwards and backwards', () => {
    const { log, textAt } = recordSession();
    const cursor = new ReplayCursor(decodeReplayLog(encodeReplayLog(log)));
    const read = () => getCodeMap(cursor.doc).get('python')?.toString() ?? '';

    for (const t of [1000, 3200, 6000, 11_000]) {
      cursor.seek(t);
      expect(read()).toBe(textAt(t));
    }
    // Backwards past the snapshot and before it.
    expect(cursor.seek(7000)).toBe(true);
    expect(read()).toBe(textAt(7000));
    cursor.seek(2000);
    expect(read()).toBe(textAt(2000));
    expect(cursor.generation).toBe(2);
  });
});
