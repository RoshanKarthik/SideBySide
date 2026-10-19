import {
  and,
  eq,
  participants,
  rooms,
  type Database,
  type ParticipantRow,
  type RoomRow,
} from '@sidebyside/db';
import type { Auth } from './auth';
import { verifyGuestToken } from './guest-token';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

export async function getSessionUser(auth: Auth, headers: Headers): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const { id, email, name, image } = session.user;
  return { id, email, name, image: image ?? null };
}

/** A guest token from `Authorization: Bearer …` or, for WebSocket upgrades, `?token=`. */
export function readGuestToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  return new URL(request.url).searchParams.get('token');
}

export interface RoomMembership {
  room: RoomRow;
  participant: ParticipantRow;
}

/**
 * Finds who the caller is inside a room: a guest holding a token for this room, or a signed-in
 * user with a participant row. Returns null when they are not part of the room.
 */
export async function resolveMembership(
  db: Database,
  auth: Auth,
  request: Request,
  guestSecret: string,
  room: RoomRow,
): Promise<RoomMembership | null> {
  const token = readGuestToken(request);
  if (token) {
    const claims = await verifyGuestToken(token, guestSecret);
    if (claims && claims.roomId === room.id) {
      const [participant] = await db
        .select()
        .from(participants)
        .where(and(eq(participants.id, claims.participantId), eq(participants.roomId, room.id)));
      if (participant) return { room, participant };
    }
  }
  const user = await getSessionUser(auth, request.headers);
  if (!user) return null;
  const [participant] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.roomId, room.id), eq(participants.userId, user.id)));
  return participant ? { room, participant } : null;
}

export async function findRoomById(db: Database, id: string): Promise<RoomRow | null> {
  if (!isUuid(id)) return null;
  const [room] = await db.select().from(rooms).where(eq(rooms.id, id));
  return room ?? null;
}

export async function findRoomBySlug(db: Database, slug: string): Promise<RoomRow | null> {
  const [room] = await db.select().from(rooms).where(eq(rooms.slug, slug));
  return room ?? null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
