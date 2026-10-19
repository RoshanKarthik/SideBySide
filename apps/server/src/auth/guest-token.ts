import { GUEST_TOKEN_TTL_SECONDS, roomRoleSchema, type RoomRole } from '@sidebyside/shared';
import { sign, verify } from 'hono/jwt';
import { z } from 'zod';

const ISSUER = 'sidebyside';

export interface GuestClaims {
  roomId: string;
  participantId: string;
  role: RoomRole;
  displayName: string;
}

const claimsSchema = z.object({
  iss: z.literal(ISSUER),
  roomId: z.string(),
  participantId: z.string(),
  role: roomRoleSchema,
  displayName: z.string(),
  exp: z.number(),
});

/** A room-scoped token for a guest candidate (no account), valid for 12 hours. */
export async function signGuestToken(
  claims: GuestClaims,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  return sign(
    { ...claims, iss: ISSUER, iat: nowSeconds, exp: nowSeconds + GUEST_TOKEN_TTL_SECONDS },
    secret,
    'HS256',
  );
}

/** Returns the claims, or null if the token is invalid, expired or not ours. */
export async function verifyGuestToken(token: string, secret: string): Promise<GuestClaims | null> {
  try {
    const payload = await verify(token, secret, { alg: 'HS256', iss: ISSUER });
    const parsed = claimsSchema.safeParse(payload);
    if (!parsed.success) return null;
    const { roomId, participantId, role, displayName } = parsed.data;
    return { roomId, participantId, role, displayName };
  } catch {
    return null;
  }
}
