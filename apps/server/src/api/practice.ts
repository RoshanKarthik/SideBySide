import { and, desc, eq, inArray, participants, practiceRatings, rooms, sql } from '@sidebyside/db';
import { practicePrefsSchema, type PracticeStats } from '@sidebyside/shared';
import { Hono, type Context } from 'hono';
import { getSessionUser } from '../auth/identity';
import type { AppDeps, AppEnv } from '../context';
import { unauthorized } from '../lib/errors';
import { parseBody } from '../lib/validate';

async function requireUser(c: Context<AppEnv>) {
  const user = await getSessionUser(c.var.auth, c.req.raw.headers);
  if (!user) throw unauthorized();
  return user;
}

export function practiceRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.post('/practice/queue', async (c) => {
    const user = await requireUser(c);
    const prefs = parseBody(practicePrefsSchema, await c.req.json().catch(() => null));
    const mm = await deps.matchmaker(c.env);
    return c.json(await mm.enqueue({ id: user.id, name: user.name }, prefs));
  });

  /** Polled every few seconds while waiting; also keeps the caller in the queue. */
  app.get('/practice/queue/status', async (c) => {
    const user = await requireUser(c);
    return c.json(await (await deps.matchmaker(c.env)).status(user.id));
  });

  app.delete('/practice/queue', async (c) => {
    const user = await requireUser(c);
    await (await deps.matchmaker(c.env)).leave(user.id);
    return c.body(null, 204);
  });

  /** Practice history and the averages of ratings the caller received (shown only to them). */
  app.get('/practice/stats', async (c) => {
    const user = await requireUser(c);
    const db = c.var.db;
    const mine = await db
      .select({ room: rooms, participantId: participants.id })
      .from(participants)
      .innerJoin(rooms, eq(rooms.id, participants.roomId))
      .where(and(eq(participants.userId, user.id), eq(rooms.mode, 'practice')))
      .orderBy(desc(rooms.createdAt))
      .limit(100);
    const roomIds = mine.map((m) => m.room.id);
    const [partners, given, [avg]] = await Promise.all([
      roomIds.length
        ? db
            .select({
              roomId: participants.roomId,
              name: participants.displayName,
              userId: participants.userId,
            })
            .from(participants)
            .where(inArray(participants.roomId, roomIds))
        : Promise.resolve([]),
      roomIds.length
        ? db
            .select({ roomId: practiceRatings.roomId })
            .from(practiceRatings)
            .where(
              and(
                inArray(practiceRatings.roomId, roomIds),
                eq(practiceRatings.fromUserId, user.id),
              ),
            )
        : Promise.resolve([]),
      db
        .select({
          problemSolving: sql<string | null>`avg(${practiceRatings.problemSolving})`,
          communication: sql<string | null>`avg(${practiceRatings.communication})`,
          interviewing: sql<string | null>`avg(${practiceRatings.interviewing})`,
          count: sql<number>`count(*)::int`,
        })
        .from(practiceRatings)
        .where(eq(practiceRatings.toUserId, user.id)),
    ]);
    const rated = new Set(given.map((g) => g.roomId));
    const body: PracticeStats = {
      sessions: mine.length,
      averages:
        avg && avg.count > 0
          ? {
              problemSolving: Number(avg.problemSolving),
              communication: Number(avg.communication),
              interviewing: Number(avg.interviewing),
              count: avg.count,
            }
          : null,
      history: mine.map(({ room }) => ({
        roomId: room.id,
        slug: room.slug,
        title: room.title,
        status: room.status,
        partnerName:
          partners.find((p) => p.roomId === room.id && p.userId !== user.id)?.name ?? 'Partner',
        createdAt: room.createdAt.toISOString(),
        rated: rated.has(room.id),
      })),
    };
    return c.json(body);
  });

  return app;
}
