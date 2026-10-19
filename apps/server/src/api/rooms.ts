import {
  createRoomSchema,
  eventVisibility,
  joinRoomSchema,
  type CreateRoomResponse,
  type JoinRoomResponse,
  type PublicRoom,
  type ReplayManifest,
  type RoomEvent,
  type RoomListItem,
} from '@sidebyside/shared';
import {
  and,
  asc,
  codeRuns,
  count,
  desc,
  eq,
  events,
  gte,
  inArray,
  participants,
  rooms,
  sessionRounds,
  users,
} from '@sidebyside/db';
import { Hono, type Context } from 'hono';
import { getSessionUser, findRoomById, findRoomBySlug, resolveMembership } from '../auth/identity';
import { signGuestToken } from '../auth/guest-token';
import { canEndSession, canSeeEvent, canViewReplay } from '../auth/permissions';
import type { AppDeps, AppEnv } from '../context';
import { HttpError, badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors';
import { parseBody } from '../lib/validate';
import { randomSlug } from '../lib/slug';
import { roomLink, toRoomDto } from '../lib/serialize';

const ROOMS_PER_DAY = 20;

async function requireUser(c: Context<AppEnv>) {
  const user = await getSessionUser(c.var.auth, c.req.raw.headers);
  if (!user) throw unauthorized();
  return user;
}

async function requireMembership(c: Context<AppEnv>, roomId: string) {
  const room = await findRoomById(c.var.db, roomId);
  if (!room) throw notFound('Room not found');
  const membership = await resolveMembership(
    c.var.db,
    c.var.auth,
    c.req.raw,
    c.env.GUEST_TOKEN_SECRET,
    room,
  );
  // Same answer for "no such room" and "not yours", so ids can't be probed.
  if (!membership) throw notFound('Room not found');
  return membership;
}

export function roomRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.post('/rooms', async (c) => {
    const user = await requireUser(c);
    const input = parseBody(createRoomSchema, await c.req.json().catch(() => null));
    const db = c.var.db;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ created } = { created: 0 }] = await db
      .select({ created: count() })
      .from(rooms)
      .where(and(eq(rooms.ownerId, user.id), gte(rooms.createdAt, since)));
    if (created >= ROOMS_PER_DAY) {
      throw new HttpError(429, 'rate_limited', `You can create up to ${ROOMS_PER_DAY} rooms a day`);
    }

    const room = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(rooms)
        .values({ ...input, slug: randomSlug(), ownerId: user.id, mode: 'interview' })
        .returning();
      if (!row) throw new Error('Room insert returned nothing');
      const [owner] = await tx
        .insert(participants)
        .values({
          roomId: row.id,
          userId: user.id,
          displayName: user.name,
          role: 'owner',
          consentAcceptedAt: new Date(),
        })
        .returning();
      await tx
        .insert(sessionRounds)
        .values({ roomId: row.id, roundNumber: 1, interviewerParticipantId: owner?.id });
      return row;
    });

    const body: CreateRoomResponse = {
      room: toRoomDto(room),
      link: roomLink(c.env.PUBLIC_APP_URL, room.slug),
    };
    return c.json(body, 201);
  });

  app.get('/rooms', async (c) => {
    const user = await requireUser(c);
    const rows = await c.var.db
      .select({ room: rooms, role: participants.role })
      .from(participants)
      .innerJoin(rooms, eq(rooms.id, participants.roomId))
      .where(eq(participants.userId, user.id))
      .orderBy(desc(rooms.createdAt))
      .limit(200);
    const body: RoomListItem[] = rows.map((r) => ({ ...toRoomDto(r.room), myRole: r.role }));
    return c.json(body);
  });

  app.get('/rooms/:slug/public', async (c) => {
    const room = await findRoomBySlug(c.var.db, c.req.param('slug'));
    if (!room) throw notFound('Room not found');
    const [owner] = await c.var.db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, room.ownerId));
    const body: PublicRoom = {
      title: room.title,
      ownerName: owner?.name ?? 'Interviewer',
      status: room.status,
    };
    return c.json(body);
  });

  /** Who the caller already is in this room, if anyone (used when reopening a room link). */
  app.get('/rooms/:slug/me', async (c) => {
    const room = await findRoomBySlug(c.var.db, c.req.param('slug'));
    if (!room) throw notFound('Room not found');
    const membership = await resolveMembership(
      c.var.db,
      c.var.auth,
      c.req.raw,
      c.env.GUEST_TOKEN_SECRET,
      room,
    );
    if (!membership) throw notFound('Not a participant');
    const { participant } = membership;
    const body: JoinRoomResponse = {
      room: toRoomDto(room),
      participant: {
        id: participant.id,
        displayName: participant.displayName,
        role: participant.role,
      },
      collabToken: null,
    };
    return c.json(body);
  });

  app.post('/rooms/:slug/join', async (c) => {
    const input = parseBody(joinRoomSchema, await c.req.json().catch(() => null));
    const db = c.var.db;
    const room = await findRoomBySlug(db, c.req.param('slug'));
    if (!room) throw notFound('Room not found');
    if (room.status === 'ended') throw conflict('This session has ended', 'room_ended');

    const existing = await resolveMembership(
      db,
      c.var.auth,
      c.req.raw,
      c.env.GUEST_TOKEN_SECRET,
      room,
    );
    const user = existing ? null : await getSessionUser(c.var.auth, c.req.raw.headers);

    let participant = existing?.participant;
    if (!participant) {
      const displayName = input.displayName ?? user?.name;
      if (!displayName) throw badRequest('Enter your name to join');
      const [row] = await db
        .insert(participants)
        .values({
          roomId: room.id,
          userId: user?.id ?? null,
          displayName,
          role: 'candidate',
          consentAcceptedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();
      participant = row;
      if (!participant && user) {
        // A concurrent join from another tab won the insert.
        [participant] = await db
          .select()
          .from(participants)
          .where(and(eq(participants.roomId, room.id), eq(participants.userId, user.id)));
      }
      if (!participant) throw new Error('Could not create participant');
      await db
        .update(sessionRounds)
        .set({ candidateParticipantId: participant.id })
        .where(and(eq(sessionRounds.roomId, room.id), eq(sessionRounds.roundNumber, 1)));
    }

    const collabToken = participant.userId
      ? null
      : await signGuestToken(
          {
            roomId: room.id,
            participantId: participant.id,
            role: participant.role,
            displayName: participant.displayName,
          },
          c.env.GUEST_TOKEN_SECRET,
        );
    const body: JoinRoomResponse = {
      room: toRoomDto(room),
      participant: {
        id: participant.id,
        displayName: participant.displayName,
        role: participant.role,
      },
      collabToken,
    };
    return c.json(body);
  });

  app.post('/rooms/:id/end', async (c) => {
    const { room, participant } = await requireMembership(c, c.req.param('id'));
    if (!canEndSession(participant.role))
      throw forbidden('Only the interviewer can end the session');
    if (room.status !== 'ended') {
      const endedAt = new Date();
      const deleteAfter = new Date(endedAt.getTime() + room.retentionDays * 24 * 60 * 60 * 1000);
      await c.var.db.transaction(async (tx) => {
        await tx
          .update(rooms)
          .set({ status: 'ended', endedAt, deleteAfter, startedAt: room.startedAt ?? endedAt })
          .where(eq(rooms.id, room.id));
        await tx.update(sessionRounds).set({ endedAt }).where(eq(sessionRounds.roomId, room.id));
        await tx.insert(events).values({
          roomId: room.id,
          participantId: participant.id,
          type: 'session_ended',
          payload: {},
          visibility: eventVisibility('session_ended'),
          serverTs: endedAt,
        });
      });
      await (await deps.room(c.env, room.id)).end();
    }
    const updated = await findRoomById(c.var.db, room.id);
    return c.json({ room: toRoomDto(updated ?? room) });
  });

  app.get('/rooms/:id/events', async (c) => {
    const { room, participant } = await requireMembership(c, c.req.param('id'));
    const rows = await c.var.db
      .select()
      .from(events)
      .where(eq(events.roomId, room.id))
      .orderBy(asc(events.serverTs), asc(events.id))
      .limit(5000);
    const body: RoomEvent[] = rows
      .filter((e) => canSeeEvent(participant.role, e.visibility))
      .map((e) => ({
        id: String(e.id),
        type: e.type as RoomEvent['type'],
        participantId: e.participantId,
        payload: e.payload,
        serverTs: e.serverTs.getTime(),
      }));
    return c.json(body);
  });

  app.get('/rooms/:id/replay/manifest', async (c) => {
    const { room, participant } = await requireMembership(c, c.req.param('id'));
    if (!canViewReplay(participant.role, room)) throw forbidden('Replay is not available to you');
    const runs = await c.var.db
      .select({
        ts: codeRuns.serverTs,
        status: codeRuns.status,
        language: codeRuns.language,
        name: participants.displayName,
      })
      .from(codeRuns)
      .leftJoin(participants, eq(participants.id, codeRuns.participantId))
      .where(and(eq(codeRuns.roomId, room.id), inArray(codeRuns.kind, ['run'])))
      .orderBy(asc(codeRuns.serverTs));
    const startTs = (room.startedAt ?? room.createdAt).getTime();
    const endTs = (room.endedAt ?? new Date()).getTime();
    const body: ReplayManifest = {
      room: toRoomDto(room),
      startTs,
      endTs: Math.max(endTs, startTs),
      markers: runs.map((r) => ({
        ts: r.ts.getTime(),
        kind: 'code_run',
        status: r.status,
        label: `${r.name ?? 'Someone'} ran ${r.language} (${r.status})`,
      })),
    };
    return c.json(body);
  });

  app.get('/rooms/:id/replay/log', async (c) => {
    const { room, participant } = await requireMembership(c, c.req.param('id'));
    if (!canViewReplay(participant.role, room)) throw forbidden('Replay is not available to you');
    const log = await (await deps.room(c.env, room.id)).getReplayLog();
    return c.body(log as Uint8Array<ArrayBuffer>, 200, {
      'content-type': 'application/octet-stream',
      'cache-control': 'private, max-age=300',
    });
  });

  return app;
}
