import { and, eq, isNull, participants } from '@sidebyside/db';
import {
  claimSessionSchema,
  type ClaimSessionResponse,
  type ClaimTokenResponse,
} from '@sidebyside/shared';
import { Hono } from 'hono';
import { findRoomById, getSessionUser, resolveMembership } from '../auth/identity';
import { canClaimSession } from '../auth/permissions';
import type { AppEnv } from '../context';
import { conflict, forbidden, notFound, unauthorized } from '../lib/errors';
import { toRoomDto } from '../lib/serialize';
import { reportsEnabled } from './reports';
import { parseBody } from '../lib/validate';

const encoder = new TextEncoder();

function base64url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * The claim token for a guest's seat. It is derived from the participant id, so asking again
 * (a second tab, a reload) returns the same token instead of invalidating the first one.
 */
async function deriveClaimToken(participantId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64url(await crypto.subtle.sign('HMAC', key, encoder.encode(`claim:${participantId}`)));
}

/** Only a hash is stored, so a database leak can't be used to claim anyone's session. */
async function hashClaimToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function claimRoutes() {
  const app = new Hono<AppEnv>();

  /** A guest candidate, once the session has ended, asks for a token to claim their seat. */
  app.post('/rooms/:id/claim-token', async (c) => {
    const room = await findRoomById(c.var.db, c.req.param('id'));
    if (!room) throw notFound('Room not found');
    const membership = await resolveMembership(
      c.var.db,
      c.var.auth,
      c.req.raw,
      c.env.GUEST_TOKEN_SECRET,
      room,
    );
    if (!membership) throw notFound('Room not found');
    const { participant } = membership;
    if (!canClaimSession(participant, room, reportsEnabled(c.env))) {
      throw forbidden('There is nothing in this session to save to an account');
    }
    const claimToken = await deriveClaimToken(participant.id, c.env.GUEST_TOKEN_SECRET);
    await c.var.db
      .update(participants)
      .set({ claimToken: await hashClaimToken(claimToken) })
      .where(and(eq(participants.id, participant.id), isNull(participants.userId)));
    const body: ClaimTokenResponse = { claimToken };
    return c.json(body);
  });

  /** A signed-in user attaches the guest seat behind a claim token to their account. */
  app.post('/claim', async (c) => {
    const user = await getSessionUser(c.var.auth, c.req.raw.headers);
    if (!user) throw unauthorized();
    const { claimToken } = parseBody(claimSessionSchema, await c.req.json().catch(() => null));
    const db = c.var.db;

    const [participant] = await db
      .select()
      .from(participants)
      .where(eq(participants.claimToken, await hashClaimToken(claimToken)));
    if (!participant) {
      throw notFound('This link has already been used or the session was deleted');
    }
    const room = await findRoomById(db, participant.roomId);
    if (!room) throw notFound('This link has already been used or the session was deleted');
    if (!canClaimSession(participant, room, reportsEnabled(c.env))) {
      throw forbidden('The interviewer is no longer sharing anything from this session');
    }
    const [existing] = await db
      .select({ id: participants.id })
      .from(participants)
      .where(and(eq(participants.roomId, room.id), eq(participants.userId, user.id)));
    if (existing) throw conflict('Your account is already part of this session', 'already_member');

    const [claimed] = await db
      .update(participants)
      .set({ userId: user.id, claimToken: null })
      .where(and(eq(participants.id, participant.id), isNull(participants.userId)))
      .returning({ id: participants.id });
    if (!claimed) throw conflict('This session has already been claimed', 'already_claimed');

    const body: ClaimSessionResponse = { room: toRoomDto(room) };
    return c.json(body);
  });

  return app;
}
