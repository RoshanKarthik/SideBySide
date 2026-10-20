import { and, connectDb, eq, rooms, type DbHandle } from '@sidebyside/db';
import type { Lobby } from 'partyserver';
import { createAuth } from '../auth/auth';
import { findRoomById, isUuid, resolveMembership } from '../auth/identity';
import { canConnectToDocument, canJoinLive, type DocumentPart } from '../auth/permissions';
import { CONNECTION_HEADER, type ConnectionInfo } from './protocol';

const PARTS: readonly DocumentPart[] = ['shared', 'private'];

/** Durable Object names look like `<roomId>--<part>`. */
export function parseDocumentName(name: string): { roomId: string; part: DocumentPart } | null {
  const [roomId, part, ...rest] = name.split('--');
  if (!roomId || !part || rest.length || !isUuid(roomId)) return null;
  if (!(PARTS as readonly string[]).includes(part)) return null;
  return { roomId, part: part as DocumentPart };
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
    const { participant } = membership;
    if (!canConnectToDocument(participant.role, target.part)) return deny(403, 'Forbidden');

    if (room.status === 'scheduled') {
      await handle.db
        .update(rooms)
        .set({ status: 'live', startedAt: new Date() })
        .where(and(eq(rooms.id, room.id), eq(rooms.status, 'scheduled')));
    }

    const info: ConnectionInfo = {
      roomId: room.id,
      participantId: participant.id,
      role: participant.role,
      displayName: participant.displayName,
      defaultLanguage: room.defaultLanguage,
    };
    const forwarded = new Request(request);
    forwarded.headers.set(CONNECTION_HEADER, JSON.stringify(info));
    return forwarded;
  } finally {
    await handle.close().catch(() => {});
  }
}
