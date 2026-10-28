import {
  and,
  asc,
  eq,
  events,
  isNotNull,
  or,
  participants,
  practiceRatings,
  rooms,
  rubricScores,
  sessionRounds,
} from '@sidebyside/db';
import {
  eventVisibility,
  ratingInputSchema,
  type Lang,
  type SessionSummary,
} from '@sidebyside/shared';
import { Hono, type Context } from 'hono';
import { findRoomById, resolveMembership } from '../auth/identity';
import {
  canDeleteRoom,
  canRate,
  canRemoveFromMySessions,
  canSwapRoles,
  canViewReplay,
  canViewSummary,
} from '../auth/permissions';
import type { AppDeps, AppEnv } from '../context';
import { conflict, forbidden, notFound } from '../lib/errors';
import { loadRounds, seesPrivateDataOf } from '../lib/rounds';
import { toRoomDto } from '../lib/serialize';
import { parseBody } from '../lib/validate';
import { queueReports } from './reports';

async function requireMembership(c: Context<AppEnv>) {
  const room = await findRoomById(c.var.db, c.req.param('id') ?? '');
  if (!room) throw notFound('Room not found');
  const membership = await resolveMembership(
    c.var.db,
    c.var.auth,
    c.req.raw,
    c.env.GUEST_TOKEN_SECRET,
    room,
  );
  if (!membership) throw notFound('Room not found');
  return membership;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Deletes every Durable Object document a room used (all parts, all rounds). */
export async function purgeRoomDocuments(
  deps: AppDeps,
  env: Env,
  roomId: string,
  rounds: number,
): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (let round = 1; round <= Math.max(1, rounds); round++) {
    for (const part of ['shared', 'private'] as const) {
      jobs.push(deps.room(env, roomId, part, round).then((r) => r.purge()));
    }
  }
  await Promise.all(jobs);
}

export function sessionRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  /** Everything an interviewer needs after a session, in one request. */
  app.get('/rooms/:id/summary', async (c) => {
    const membership = await requireMembership(c);
    const { room, participant, role } = membership;
    if (!canViewSummary(participant.role)) throw forbidden('Only interviewers can see this page');

    const db = c.var.db;
    const [people, rounds, rows, rubric] = await Promise.all([
      db
        .select()
        .from(participants)
        .where(eq(participants.roomId, room.id))
        .orderBy(asc(participants.joinedAt)),
      loadRounds(db, room.id),
      db
        .select()
        .from(events)
        .where(eq(events.roomId, room.id))
        .orderBy(asc(events.serverTs), asc(events.id))
        .limit(10_000),
      db.select().from(rubricScores).where(eq(rubricScores.roomId, room.id)),
    ]);
    const name = (id: string | null) => people.find((p) => p.id === id)?.displayName ?? null;
    const roundNumbers = rounds.length ? rounds.map((r) => r.roundNumber) : [1];

    const summaryRounds: SessionSummary['rounds'] = roundNumbers
      .filter((n) => n <= room.currentRound)
      .map((n) => {
        const round = rounds.find((r) => r.roundNumber === n);
        const mine = seesPrivateDataOf(membership, round);
        const evs = rows.filter((e) => e.roundNumber === n);
        const of = (type: string) => evs.filter((e) => e.type === type);
        const runs = of('code_run');
        return {
          roundNumber: n,
          interviewer: name(round?.interviewerParticipantId ?? null),
          candidate: name(round?.candidateParticipantId ?? null),
          mine,
          questions: of('question_shown').map((e) => ({
            questionId: String(e.payload.questionId ?? ''),
            title: String(e.payload.title ?? ''),
            ts: e.serverTs.getTime(),
          })),
          hintsRevealed: of('hint_revealed').length,
          runs: {
            total: runs.length,
            ok: runs.filter((e) => e.payload.status === 'ok').length,
            failed: runs.filter((e) => e.payload.status !== 'ok').length,
          },
          tests: of('tests_run').map((e) => ({
            ts: e.serverTs.getTime(),
            passed: num(e.payload.passed),
            total: num(e.payload.total),
            // Test runs recorded before scores existed have none.
            score: typeof e.payload.score === 'number' ? e.payload.score : null,
            language: (e.payload.language as Lang) ?? 'python',
          })),
          rubric: mine
            ? rubric
                .filter((r) => r.roundNumber === n)
                .map((r) => ({ criterion: r.criterion, score: r.score, comment: r.comment }))
            : null,
          signals: {
            pastes: of('paste').length,
            pastedChars: of('paste').reduce((s, e) => s + num(e.payload.chars), 0),
            largeInserts: of('large_insert').length,
            tabHidden: of('tab_hidden').length,
            hiddenMs: of('tab_visible').reduce((s, e) => s + num(e.payload.hiddenMs), 0),
            windowBlur: of('window_blur').length,
            awayMs: of('window_focus').reduce((s, e) => s + num(e.payload.awayMs), 0),
          },
        };
      });

    const start = room.startedAt ?? room.createdAt;
    const end = room.endedAt ?? new Date();
    const body: SessionSummary = {
      room: toRoomDto(room),
      myRole: role,
      durationMs: room.startedAt ? Math.max(0, end.getTime() - start.getTime()) : 0,
      participants: people.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        role: p.role,
        joinedAt: p.joinedAt.toISOString(),
        isGuest: !p.userId,
      })),
      rounds: summaryRounds,
      canDelete: canDeleteRoom(participant.role),
      canRemove: canRemoveFromMySessions(participant),
      canViewReplay: canViewReplay(participant.role, room),
    };
    return c.json(body);
  });

  /**
   * Deletes the room, its recordings and everything linked to it. Owner only, at any time: a room
   * left live (everyone closed the tab) can be deleted too, and anyone connected is disconnected.
   */
  app.delete('/rooms/:id', async (c) => {
    const { room, participant } = await requireMembership(c);
    if (!canDeleteRoom(participant.role)) {
      throw forbidden('Only the room owner can delete it; remove it from your sessions instead');
    }
    await purgeRoomDocuments(deps, c.env, room.id, room.currentRound);
    await c.var.db.delete(rooms).where(eq(rooms.id, room.id));
    return c.body(null, 204);
  });

  /**
   * Removes the room from the caller's sessions without deleting it for the others: their seat is
   * unlinked from their account and ratings involving them in this room are deleted. A practice
   * room with nobody left who has an account is deleted for good.
   */
  app.delete('/rooms/:id/me', async (c) => {
    const { room, participant } = await requireMembership(c);
    if (!canRemoveFromMySessions(participant) || !participant.userId) {
      throw forbidden(
        participant.role === 'owner'
          ? 'You own this session; delete it instead'
          : 'Only signed-in participants can remove a session',
      );
    }
    const userId = participant.userId;
    const db = c.var.db;
    await db.transaction(async (tx) => {
      await tx
        .delete(practiceRatings)
        .where(
          and(
            eq(practiceRatings.roomId, room.id),
            or(eq(practiceRatings.fromUserId, userId), eq(practiceRatings.toUserId, userId)),
          ),
        );
      await tx
        .update(participants)
        .set({ userId: null })
        .where(eq(participants.id, participant.id));
    });
    if (room.mode === 'practice') {
      const [partner] = await db
        .select({ userId: participants.userId })
        .from(participants)
        .where(and(eq(participants.roomId, room.id), isNotNull(participants.userId)));
      if (!partner?.userId) {
        await purgeRoomDocuments(deps, c.env, room.id, room.currentRound);
        await db.delete(rooms).where(eq(rooms.id, room.id));
      } else if (room.ownerId === userId) {
        // Practice rooms record one peer as owner (for retention); it passes to the partner.
        await db.update(rooms).set({ ownerId: partner.userId }).where(eq(rooms.id, room.id));
      }
    }
    return c.body(null, 204);
  });

  /** Practice: either peer swaps roles; round 2 starts in fresh documents. */
  app.post('/rooms/:id/rounds/next', async (c) => {
    const { room, participant } = await requireMembership(c);
    if (!canSwapRoles(participant.role, room)) {
      throw forbidden('Only practice peers can swap roles during a session');
    }
    const rounds = await loadRounds(c.var.db, room.id);
    const next = rounds.find((r) => r.roundNumber === room.currentRound + 1);
    if (!next) throw conflict('This was the last round', 'no_more_rounds');

    const now = new Date();
    // Only one of two simultaneous clicks moves the round forward.
    const [moved] = await c.var.db
      .update(rooms)
      .set({ currentRound: next.roundNumber })
      .where(and(eq(rooms.id, room.id), eq(rooms.currentRound, room.currentRound)))
      .returning({ id: rooms.id });
    if (moved) {
      await c.var.db
        .update(sessionRounds)
        .set({ endedAt: now })
        .where(
          and(eq(sessionRounds.roomId, room.id), eq(sessionRounds.roundNumber, room.currentRound)),
        );
      await c.var.db
        .update(sessionRounds)
        .set({ startedAt: now })
        .where(eq(sessionRounds.id, next.id));
      const name = async (id: string | null) =>
        id
          ? ((
              await c.var.db
                .select({ n: participants.displayName })
                .from(participants)
                .where(eq(participants.id, id))
            )[0]?.n ?? '')
          : '';
      await c.var.db.insert(events).values({
        roomId: room.id,
        roundNumber: next.roundNumber,
        participantId: participant.id,
        type: 'round_started',
        payload: {
          roundNumber: next.roundNumber,
          interviewerName: await name(next.interviewerParticipantId),
          candidateName: await name(next.candidateParticipantId),
        },
        visibility: eventVisibility('round_started'),
        serverTs: now,
      });
      await Promise.all([
        (await deps.room(c.env, room.id, 'shared', room.currentRound)).closeRound(next.roundNumber),
        (await deps.room(c.env, room.id, 'private', room.currentRound)).closeRound(
          next.roundNumber,
        ),
      ]);
      await queueReports(deps, c.env, c.var.db, room.id, room.currentRound);
    }
    const updated = await findRoomById(c.var.db, room.id);
    return c.json({ room: toRoomDto(updated ?? room) });
  });

  /** Practice: rate your partner once the session is over (one rating each, editable). */
  app.post('/rooms/:id/ratings', async (c) => {
    const { room, participant } = await requireMembership(c);
    if (!canRate(participant.role, room) || !participant.userId) {
      throw forbidden('Ratings are for practice peers after the session');
    }
    const input = parseBody(ratingInputSchema, await c.req.json().catch(() => null));
    const peers = await c.var.db
      .select()
      .from(participants)
      .where(and(eq(participants.roomId, room.id), eq(participants.role, 'peer')));
    const other = peers.find((p) => p.id !== participant.id);
    if (!other?.userId) throw conflict('Your partner has deleted their account', 'no_partner');
    await c.var.db
      .insert(practiceRatings)
      .values({ roomId: room.id, fromUserId: participant.userId, toUserId: other.userId, ...input })
      .onConflictDoUpdate({
        target: [practiceRatings.roomId, practiceRatings.fromUserId],
        set: { ...input },
      });
    return c.json({ ok: true });
  });

  app.get('/rooms/:id/ratings/mine', async (c) => {
    const { room, participant } = await requireMembership(c);
    if (!participant.userId) return c.json({ rating: null });
    const [row] = await c.var.db
      .select()
      .from(practiceRatings)
      .where(
        and(
          eq(practiceRatings.roomId, room.id),
          eq(practiceRatings.fromUserId, participant.userId),
        ),
      );
    return c.json({
      rating: row
        ? {
            problemSolving: row.problemSolving,
            communication: row.communication,
            interviewing: row.interviewing,
            comment: row.comment,
          }
        : null,
    });
  });

  return app;
}
