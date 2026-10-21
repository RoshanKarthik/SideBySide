import { and, asc, inArray, lte, notInArray, rooms, type Database } from '@sidebyside/db';
import { purgeRoomDocuments } from '../api/sessions';
import type { AppDeps } from '../context';

/** Rooms handled together; each one costs two Durable Object calls per round. */
export const RETENTION_BATCH_SIZE = 10;
/** Keeps one run well inside a Worker invocation's limits; the rest wait for the next run. */
export const RETENTION_MAX_ROOMS_PER_RUN = 100;

export interface RetentionResult {
  deleted: number;
  failed: number;
}

/**
 * Hard-deletes rooms whose retention period is over: first their Durable Object documents,
 * then the Postgres row (participants, events, code runs, rubric and rounds cascade from it).
 *
 * Safe to rerun: purging an already-empty document does nothing, and a room whose documents
 * could not be purged keeps its row, so the next run tries it again.
 */
export async function deleteExpiredRooms(
  deps: AppDeps,
  env: Env,
  db: Database,
  now = new Date(),
): Promise<RetentionResult> {
  const failed: string[] = [];
  let deleted = 0;
  for (;;) {
    const left = RETENTION_MAX_ROOMS_PER_RUN - deleted - failed.length;
    if (left <= 0) break;
    const batch = await db
      .select({ id: rooms.id, currentRound: rooms.currentRound })
      .from(rooms)
      .where(
        and(
          lte(rooms.deleteAfter, now),
          // Rooms that failed earlier in this run wait for the next run.
          failed.length ? notInArray(rooms.id, failed) : undefined,
        ),
      )
      .orderBy(asc(rooms.deleteAfter))
      .limit(Math.min(RETENTION_BATCH_SIZE, left));
    if (!batch.length) break;

    const purged = await Promise.allSettled(
      batch.map((r) => purgeRoomDocuments(deps, env, r.id, r.currentRound)),
    );
    const ready: string[] = [];
    purged.forEach((result, i) => {
      const id = batch[i]!.id;
      if (result.status === 'fulfilled') {
        ready.push(id);
      } else {
        console.error('Retention: could not purge room documents', id, result.reason);
        failed.push(id);
      }
    });
    if (ready.length) {
      const removed = await db
        .delete(rooms)
        .where(inArray(rooms.id, ready))
        .returning({ id: rooms.id });
      deleted += removed.length;
    }
  }
  return { deleted, failed: failed.length };
}
