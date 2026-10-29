import {
  codeRuns,
  eq,
  events,
  participants,
  rooms,
  rubricScores,
  sessionRounds,
  users,
  type DbHandle,
} from '@sidebyside/db';
import { createTestDb } from '@sidebyside/db/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AppDeps, RoomRpc } from '../context';
import { deleteExpiredRooms, RETENTION_BATCH_SIZE } from './retention';

const env = {} as Env;
const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-21T03:30:00Z');

let handle: DbHandle;
let ownerId: string;
/** `roomId:part:round` of every Durable Object document purged. */
let purged: string[];
/** Rooms whose documents fail to purge (a Durable Object outage). */
let failing: Set<string>;

const deps: AppDeps = {
  openDb: async () => ({ db: handle.db, close: async () => {} }),
  room: async (_env, roomId, part = 'shared', round = 1) =>
    ({
      purge: async () => {
        if (failing.has(roomId)) throw new Error('Durable Object unavailable');
        purged.push(`${roomId}:${part}:${round}`);
      },
    }) as RoomRpc,
  matchmaker: async () => {
    throw new Error('Not used in these tests');
  },
  execution: () => null,
};

/** An ended room with a candidate, events, a code run and rubric scores. */
async function endedRoom(title: string, deleteAfter: Date | null, currentRound = 1) {
  const db = handle.db;
  const [room] = await db
    .insert(rooms)
    .values({
      slug: `${title}`.padEnd(10, 'x').slice(0, 10),
      ownerId,
      title,
      status: deleteAfter ? 'ended' : 'live',
      endedAt: deleteAfter ? new Date(deleteAfter.getTime() - 30 * DAY) : null,
      deleteAfter,
      currentRound,
    })
    .returning();
  const [candidate] = await db
    .insert(participants)
    .values({ roomId: room!.id, displayName: 'Asha', role: 'candidate' })
    .returning();
  await db.insert(sessionRounds).values({ roomId: room!.id, roundNumber: 1 });
  await db.insert(events).values({
    roomId: room!.id,
    participantId: candidate!.id,
    type: 'paste',
    payload: { chars: 12, preview: 'print(1)' },
    serverTs: new Date(),
  });
  await db.insert(codeRuns).values({
    roomId: room!.id,
    participantId: candidate!.id,
    language: 'python',
    sourceCode: 'print(1)',
    status: 'ok',
    serverTs: new Date(),
  });
  await db
    .insert(rubricScores)
    .values({ roomId: room!.id, roundNumber: 1, criterion: 'Problem solving', score: 3 });
  return room!.id;
}

async function rowsFor(roomId: string) {
  const db = handle.db;
  const [r, p, e, c, s, sr] = await Promise.all([
    db.select().from(rooms).where(eq(rooms.id, roomId)),
    db.select().from(participants).where(eq(participants.roomId, roomId)),
    db.select().from(events).where(eq(events.roomId, roomId)),
    db.select().from(codeRuns).where(eq(codeRuns.roomId, roomId)),
    db.select().from(rubricScores).where(eq(rubricScores.roomId, roomId)),
    db.select().from(sessionRounds).where(eq(sessionRounds.roomId, roomId)),
  ]);
  return r.length + p.length + e.length + c.length + s.length + sr.length;
}

beforeAll(async () => {
  handle = await createTestDb();
  const [owner] = await handle.db
    .insert(users)
    .values({ email: 'owner@example.test', name: 'Priya' })
    .returning();
  ownerId = owner!.id;
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  await handle.db.delete(rooms);
  purged = [];
  failing = new Set();
});

describe('retention cleanup', () => {
  it('deletes expired rooms and everything linked to them, and nothing else', async () => {
    const expired = await endedRoom('expired', new Date(now.getTime() - DAY));
    const dueNow = await endedRoom('due-now', now);
    const kept = await endedRoom('kept', new Date(now.getTime() + DAY));
    const live = await endedRoom('live', null);
    expect(await rowsFor(expired)).toBeGreaterThan(1);

    const result = await deleteExpiredRooms(deps, env, handle.db, now);

    expect(result).toEqual({ deleted: 2, failed: 0 });
    expect(await rowsFor(expired)).toBe(0);
    expect(await rowsFor(dueNow)).toBe(0);
    expect(await rowsFor(kept)).toBe(6);
    expect(await rowsFor(live)).toBe(6);
    // Both documents of each deleted room are purged; the others are left alone.
    expect(purged.sort()).toEqual(
      [
        `${dueNow}:private:1`,
        `${dueNow}:shared:1`,
        `${expired}:private:1`,
        `${expired}:shared:1`,
      ].sort(),
    );
  });

  it('purges every round of a practice room', async () => {
    const practice = await endedRoom('practice', new Date(now.getTime() - DAY), 2);
    await deleteExpiredRooms(deps, env, handle.db, now);
    expect(purged.sort()).toEqual(
      [
        `${practice}:private:1`,
        `${practice}:private:2`,
        `${practice}:shared:1`,
        `${practice}:shared:2`,
      ].sort(),
    );
    expect(await rowsFor(practice)).toBe(0);
  });

  it('keeps a room whose documents could not be purged and retries it on the next run', async () => {
    const stuck = await endedRoom('stuck', new Date(now.getTime() - 2 * DAY));
    const fine = await endedRoom('fine', new Date(now.getTime() - DAY));
    failing.add(stuck);

    expect(await deleteExpiredRooms(deps, env, handle.db, now)).toEqual({ deleted: 1, failed: 1 });
    expect(await rowsFor(stuck)).toBe(6);
    expect(await rowsFor(fine)).toBe(0);

    failing.clear();
    expect(await deleteExpiredRooms(deps, env, handle.db, now)).toEqual({ deleted: 1, failed: 0 });
    expect(await rowsFor(stuck)).toBe(0);
    // A third run finds nothing left to do.
    expect(await deleteExpiredRooms(deps, env, handle.db, now)).toEqual({ deleted: 0, failed: 0 });
  });

  it('works through more rooms than fit in one batch', async () => {
    const count = RETENTION_BATCH_SIZE * 2 + 3;
    for (let i = 0; i < count; i++) {
      await endedRoom(`bulk${String(i).padStart(2, '0')}`, new Date(now.getTime() - DAY));
    }
    expect(await deleteExpiredRooms(deps, env, handle.db, now)).toEqual({
      deleted: count,
      failed: 0,
    });
    expect(await handle.db.select().from(rooms)).toHaveLength(0);
  });
});
