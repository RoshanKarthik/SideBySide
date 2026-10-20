import {
  and,
  asc,
  eq,
  participants,
  roomQuestions,
  rooms,
  type QuestionRow,
  type RoomRow,
} from '@sidebyside/db';
import { LANGUAGES, type JoinRoomResponse, type Lang, type Question } from '@sidebyside/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  findRoomById,
  findRoomBySlug,
  getSessionUser,
  isUuid,
  resolveMembership,
} from '../auth/identity';
import { canInviteInterviewers, canManageInterview } from '../auth/permissions';
import type { AppDeps, AppEnv } from '../context';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors';
import { findQuestion, loadTests, toQuestion } from '../lib/questions';
import { roomLink, toRoomDto } from '../lib/serialize';
import { randomSlug } from '../lib/slug';
import { parseBody } from '../lib/validate';

/** Interviewers may use public questions, their own, and the room owner's. */
function canUseInRoom(q: QuestionRow, room: RoomRow, userId: string | null): boolean {
  return q.isPublic || q.ownerId === room.ownerId || (!!userId && q.ownerId === userId);
}

async function requireInterviewer(c: Context<AppEnv>) {
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
  if (!canManageInterview(membership.participant.role)) {
    throw forbidden('Only interviewers can do that');
  }
  return membership;
}

async function requireRoomQuestion(c: Context<AppEnv>, room: RoomRow, userId: string | null) {
  const qid = c.req.param('qid') ?? '';
  const q = isUuid(qid) ? await findQuestion(c.var.db, qid) : null;
  if (!q || !canUseInRoom(q, room, userId)) throw notFound('Question not found');
  return q;
}

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function roomToolRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  /** The full question, hidden tests included: interviewers run them in their browser. */
  app.get('/rooms/:id/questions/:qid', async (c) => {
    const { room, participant } = await requireInterviewer(c);
    const q = await requireRoomQuestion(c, room, participant.userId);
    const body: Question = toQuestion(
      q,
      await loadTests(c.var.db, [q.id]),
      participant.userId ?? '',
      true,
    );
    return c.json(body);
  });

  app.get('/rooms/:id/questions', async (c) => {
    const { room } = await requireInterviewer(c);
    const rows = await c.var.db
      .select()
      .from(roomQuestions)
      .where(eq(roomQuestions.roomId, room.id))
      .orderBy(asc(roomQuestions.shownAt));
    return c.json(
      rows.map((r) => ({
        questionId: r.questionId,
        title: r.title,
        shownAt: r.shownAt.toISOString(),
      })),
    );
  });

  app.post('/rooms/:id/questions/:qid/show', async (c) => {
    const { room, participant } = await requireInterviewer(c);
    if (room.status === 'ended') throw conflict('This session has ended', 'room_ended');
    const q = await requireRoomQuestion(c, room, participant.userId);
    await c.var.db
      .insert(roomQuestions)
      .values({ roomId: room.id, questionId: q.id, title: q.title });
    const starterCode: Partial<Record<Lang, string>> = {};
    for (const lang of LANGUAGES) {
      const code = q.starterCode[lang];
      if (code) starterCode[lang] = code;
    }
    await (
      await deps.room(c.env, room.id)
    ).showQuestion(
      { roomId: room.id, participantId: participant.id },
      {
        problem: {
          questionId: q.id,
          title: q.title,
          difficulty: q.difficulty,
          descriptionMd: q.descriptionMd,
          hintCount: q.hints.length,
        },
        starterCode,
      },
    );
    return c.json({ ok: true });
  });

  app.post('/rooms/:id/questions/:qid/hints/:index/reveal', async (c) => {
    const { room, participant } = await requireInterviewer(c);
    if (room.status === 'ended') throw conflict('This session has ended', 'room_ended');
    const q = await requireRoomQuestion(c, room, participant.userId);
    const index = Number(c.req.param('index'));
    const text = Number.isInteger(index) ? q.hints[index] : undefined;
    if (text === undefined) throw notFound('Hint not found');
    const ok = await (
      await deps.room(c.env, room.id)
    ).revealHint({ roomId: room.id, participantId: participant.id }, q.id, index, text);
    if (!ok) throw conflict('Show the question to the candidate first', 'not_active');
    return c.json({ ok: true });
  });

  /** The owner's co-interviewer invite link (created on first request). */
  app.get('/rooms/:id/invite', async (c) => {
    const { room, participant } = await requireInterviewer(c);
    if (!canInviteInterviewers(participant.role)) throw forbidden('Only the room owner can invite');
    let token = room.coInterviewerToken;
    if (!token) {
      token = randomSlug(24);
      await c.var.db.update(rooms).set({ coInterviewerToken: token }).where(eq(rooms.id, room.id));
    }
    return c.json({ link: `${roomLink(c.env.PUBLIC_APP_URL, room.slug)}?invite=${token}` });
  });

  app.post('/rooms/:slug/co-interviewer', async (c) => {
    const { token } = parseBody(
      z.object({ token: z.string().min(1).max(64) }),
      await c.req.json().catch(() => null),
    );
    const user = await getSessionUser(c.var.auth, c.req.raw.headers);
    if (!user) throw unauthorized('Sign in to join as a co-interviewer');
    const room = await findRoomBySlug(c.var.db, c.req.param('slug'));
    if (!room) throw notFound('Room not found');
    if (!room.coInterviewerToken || !sameSecret(room.coInterviewerToken, token)) {
      throw badRequest('This invite link is not valid', 'bad_invite');
    }
    if (room.status === 'ended') throw conflict('This session has ended', 'room_ended');

    const [existing] = await c.var.db
      .select()
      .from(participants)
      .where(and(eq(participants.roomId, room.id), eq(participants.userId, user.id)));
    let participant = existing;
    if (!participant) {
      [participant] = await c.var.db
        .insert(participants)
        .values({
          roomId: room.id,
          userId: user.id,
          displayName: user.name,
          role: 'interviewer',
          consentAcceptedAt: new Date(),
        })
        .returning();
    } else if (participant.role === 'candidate') {
      [participant] = await c.var.db
        .update(participants)
        .set({ role: 'interviewer' })
        .where(eq(participants.id, participant.id))
        .returning();
    }
    const body: JoinRoomResponse = {
      room: toRoomDto(room),
      participant: {
        id: participant!.id,
        displayName: participant!.displayName,
        role: participant!.role,
      },
      collabToken: null,
    };
    return c.json(body);
  });

  return app;
}
