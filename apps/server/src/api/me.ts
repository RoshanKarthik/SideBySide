import { patchMeSchema, type Me } from '@sidebyside/shared';
import {
  and,
  asc,
  codeRuns,
  eq,
  events,
  inArray,
  ne,
  participants,
  practiceRatings,
  questions,
  rooms,
  rubricScores,
  testCases,
  users,
} from '@sidebyside/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { enabledProviders } from '../auth/auth';
import { getSessionUser } from '../auth/identity';
import type { AppDeps, AppEnv } from '../context';
import { badRequest, notFound, unauthorized } from '../lib/errors';
import { parseBody } from '../lib/validate';
import { toBrand } from '../lib/serialize';
import { purgeRoomDocuments } from './sessions';

export function meRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  /** Which sign-in buttons the login page should show. */
  app.get('/auth-providers', (c) =>
    c.json({ providers: enabledProviders(c.env, deps.mailer(c.env) !== null) }),
  );

  app.get('/me', async (c) => {
    const session = await getSessionUser(c.var.auth, c.req.raw.headers);
    if (!session) throw unauthorized();
    const [row] = await c.var.db.select().from(users).where(eq(users.id, session.id));
    if (!row) throw notFound('User not found');
    return c.json(toMe(row));
  });

  app.patch('/me', async (c) => {
    const session = await getSessionUser(c.var.auth, c.req.raw.headers);
    if (!session) throw unauthorized();
    const input = parseBody(patchMeSchema, await c.req.json().catch(() => null));
    const [row] = await c.var.db
      .update(users)
      .set({
        ...(input.displayName !== undefined && { name: input.displayName }),
        ...(input.defaultLanguage !== undefined && { defaultLanguage: input.defaultLanguage }),
        ...(input.lowBandwidth !== undefined && { lowBandwidth: input.lowBandwidth }),
        ...(input.brand?.companyName !== undefined && {
          companyName: input.brand.companyName || null,
        }),
        ...(input.brand?.logo !== undefined && { brandLogo: input.brand.logo }),
        ...(input.brand?.color !== undefined && { brandColor: input.brand.color }),
      })
      .where(eq(users.id, session.id))
      .returning();
    if (!row) throw notFound('User not found');
    return c.json(toMe(row));
  });

  /**
   * A JSON copy of the caller's data: profile, rooms they own (with participants, events, runs
   * and rubric), rooms they took part in, their questions, and practice ratings. Live document
   * contents stay in the rooms' replays.
   */
  app.get('/me/export', async (c) => {
    const session = await getSessionUser(c.var.auth, c.req.raw.headers);
    if (!session) throw unauthorized();
    const db = c.var.db;
    const [user] = await db.select().from(users).where(eq(users.id, session.id));
    if (!user) throw notFound('User not found');
    const owned = await db.select().from(rooms).where(eq(rooms.ownerId, user.id));
    const ownedIds = owned.map((r) => r.id);
    const [ownedPeople, ownedEvents, ownedRuns, ownedRubric, joined, myQuestions, ratings] =
      await Promise.all([
        ownedIds.length
          ? db.select().from(participants).where(inArray(participants.roomId, ownedIds))
          : [],
        ownedIds.length
          ? db
              .select()
              .from(events)
              .where(inArray(events.roomId, ownedIds))
              .orderBy(asc(events.serverTs))
          : [],
        ownedIds.length ? db.select().from(codeRuns).where(inArray(codeRuns.roomId, ownedIds)) : [],
        ownedIds.length
          ? db.select().from(rubricScores).where(inArray(rubricScores.roomId, ownedIds))
          : [],
        db
          .select({ room: rooms, role: participants.role, joinedAt: participants.joinedAt })
          .from(participants)
          .innerJoin(rooms, eq(rooms.id, participants.roomId))
          .where(and(eq(participants.userId, user.id), ne(rooms.ownerId, user.id))),
        db.select().from(questions).where(eq(questions.ownerId, user.id)),
        db.select().from(practiceRatings).where(eq(practiceRatings.fromUserId, user.id)),
      ]);
    const questionIds = myQuestions.map((q) => q.id);
    const tests = questionIds.length
      ? await db.select().from(testCases).where(inArray(testCases.questionId, questionIds))
      : [];
    const body = {
      exportedAt: new Date().toISOString(),
      profile: toMe(user),
      ownedRooms: owned.map((room) => ({
        ...room,
        coInterviewerToken: undefined,
        participants: ownedPeople
          .filter((p) => p.roomId === room.id)
          .map((p) => ({ ...p, claimToken: undefined })),
        events: ownedEvents.filter((e) => e.roomId === room.id),
        codeRuns: ownedRuns.filter((r) => r.roomId === room.id),
        rubric: ownedRubric.filter((r) => r.roomId === room.id),
      })),
      joinedRooms: joined.map((j) => ({
        id: j.room.id,
        title: j.room.title,
        mode: j.room.mode,
        role: j.role,
        joinedAt: j.joinedAt,
      })),
      questions: myQuestions.map((q) => ({
        ...q,
        testCases: tests.filter((t) => t.questionId === q.id),
      })),
      practiceRatingsGiven: ratings,
    };
    c.header('content-disposition', 'attachment; filename="sidebyside-export.json"');
    return c.json(body);
  });

  /**
   * Deletes the account. Rooms the user owns are deleted with their recordings, except
   * practice rooms, which pass to the partner so their history survives. In rooms owned by
   * others the user's participant rows stay (as a name) but lose the link to the account.
   */
  app.delete('/me', async (c) => {
    const session = await getSessionUser(c.var.auth, c.req.raw.headers);
    if (!session) throw unauthorized();
    const { confirm } = parseBody(
      z.object({ confirm: z.string() }),
      await c.req.json().catch(() => null),
    );
    if (confirm.trim().toLowerCase() !== session.email.toLowerCase()) {
      throw badRequest('Type your email address to confirm', 'bad_confirmation');
    }
    const db = c.var.db;
    const owned = await db.select().from(rooms).where(eq(rooms.ownerId, session.id));
    const toDelete: typeof owned = [];
    for (const room of owned) {
      if (room.mode === 'practice') {
        const [partner] = await db
          .select({ userId: participants.userId })
          .from(participants)
          .where(and(eq(participants.roomId, room.id), ne(participants.userId, session.id)));
        if (partner?.userId) {
          await db.update(rooms).set({ ownerId: partner.userId }).where(eq(rooms.id, room.id));
          continue;
        }
      }
      toDelete.push(room);
    }
    await (await deps.matchmaker(c.env)).leave(session.id).catch(() => {});
    await Promise.all(toDelete.map((r) => purgeRoomDocuments(deps, c.env, r.id, r.currentRound)));
    // Cascades to sessions, accounts, owned rooms (and their data) and owned questions.
    await db.delete(users).where(eq(users.id, session.id));
    return c.body(null, 204);
  });

  return app;
}

function toMe(row: typeof users.$inferSelect): Me {
  return {
    id: row.id,
    email: row.email,
    displayName: row.name,
    avatarUrl: row.image,
    defaultLanguage: row.defaultLanguage,
    lowBandwidth: row.lowBandwidth,
    brand: toBrand(row),
  };
}
