import type { IceServer, IceServersResponse } from '@sidebyside/shared';
import { Hono } from 'hono';
import { findRoomById, resolveMembership } from '../auth/identity';
import type { AppEnv } from '../context';
import { notFound } from '../lib/errors';

/** Free and unlimited; enough when the two browsers can reach each other directly. */
export const STUN_SERVERS: IceServer[] = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
];
/** TURN credentials last a day; a room never runs that long. */
const CREDENTIAL_TTL_SECONDS = 24 * 60 * 60;

/** Browsers block port 53, and a URL that can't connect only slows the call's setup down. */
function usable(server: IceServer): IceServer | null {
  const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter(
    (url) => !/:53(\?|$)/.test(url),
  );
  return urls.length ? { ...server, urls } : null;
}

/**
 * Short-lived TURN credentials from Cloudflare Realtime, so calls also connect on strict
 * networks that block direct routes. The TURN key stays on the server; without one (or if
 * Cloudflare can't be reached) calls fall back to STUN only.
 */
export async function iceServersFor(env: Env, fetcher: typeof fetch = fetch): Promise<IceServer[]> {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return STUN_SERVERS;
  try {
    const res = await fetcher(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
      },
    );
    if (!res.ok) throw new Error(`Cloudflare TURN answered ${res.status}`);
    const { iceServers } = (await res.json()) as IceServersResponse;
    const servers = iceServers.map(usable).filter((s): s is IceServer => s !== null);
    return servers.length ? servers : STUN_SERVERS;
  } catch (err) {
    console.error('TURN credentials unavailable', err);
    return STUN_SERVERS;
  }
}

export function iceServerRoutes() {
  const app = new Hono<AppEnv>();

  app.get('/rooms/:id/ice-servers', async (c) => {
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
    c.header('cache-control', 'private, no-store');
    const body: IceServersResponse = { iceServers: await iceServersFor(c.env) };
    return c.json(body);
  });

  return app;
}
