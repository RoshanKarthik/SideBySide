import { and, connectDb, eq, rooms, type DbHandle } from '@sidebyside/db';
import { parseRoomDocumentName } from '@sidebyside/shared';
import type { Lobby } from 'partyserver';
import { createAuth } from '../auth/auth';
import { findRoomById, isUuid, resolveMembership } from '../auth/identity';
import { canConnectToDocument, canJoinLive } from '../auth/permissions';
import { CONNECTION_HEADER, type ConnectionInfo } from './protocol';

/** Durable Object names look like `<roomId>--<part>`, plus `-r<n>` for later practice rounds. */
export function parseDocumentName(name: string) {
  const parsed = parseRoomDocumentName(name);
  return parsed && isUuid(parsed.roomId) ? parsed : null;
}

const deny = (status: number, message: string) => new Response(message, { status });

/**
 * Authorises a WebSocket upgrade before it reaches the room. The room trusts the connection
 * header only because this function always overwrites it.
 */
export async function authorizeConnection(
  request: Request,
  lobby: Pick<Lobby<Env>, 'name'>,
  env: Env,
  openDb: (env: Env) => Promise<DbHandle> = (e) => connectDb(e.HYPERDRIVE.connectionString),
): Promise<Request | Response> {
  const target = parseDocumentName(lobby.name);
  if (!target) return deny(404, 'Unknown document');

  const handle = await openDb(env);
  try {
    const room = await findRoomById(handle.db, target.roomId);
    if (!room) return deny(404, 'Room not found');
    if (!canJoinLive(room)) return deny(410, 'Session ended');

    const auth = createAuth(env, handle.db);
    const membership = await resolveMembership(
      handle.db,
      auth,
      request,
      env.GUEST_TOKEN_SECRET,
      room,
    );
    if (!membership) return deny(401, 'Not a participant');
    const { participant, role } = membership;
    // Only the current round is live; earlier rounds are recordings.
    if (target.round !== room.currentRound) return deny(410, 'Round over');
    if (!canConnectToDocument(role, target.part)) return deny(403, 'Forbidden');

    if (room.status === 'scheduled') {
      await handle.db
        .update(rooms)
        .set({ status: 'live', startedAt: new Date() })
        .where(and(eq(rooms.id, room.id), eq(rooms.status, 'scheduled')));
    }

    const info: ConnectionInfo = {
      roomId: room.id,
      participantId: participant.id,
      role,
      displayName: participant.displayName,
      defaultLanguage: room.defaultLanguage,
      round: target.round,
    };
    const forwarded = new Request(request);
    forwarded.headers.set(CONNECTION_HEADER, JSON.stringify(info));
    return forwarded;
  } finally {
    await handle.close().catch(() => {});
  }
}
