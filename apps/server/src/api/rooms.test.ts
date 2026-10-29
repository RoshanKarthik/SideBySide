import type { DbHandle } from '@sidebyside/db';
import { createTestDb } from '@sidebyside/db/testing';
import type { JoinRoomResponse, Me, PublicRoom, RoomEvent, RoomListItem } from '@sidebyside/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import type { AppDeps } from '../context';

const ORIGIN = 'http://localhost:5173';
const env = {
  PUBLIC_APP_URL: ORIGIN,
  TRUSTED_ORIGINS: '',
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
  GUEST_TOKEN_SECRET: 'guest-secret-guest-secret-guest-secret',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  GITHUB_CLIENT_ID: '',
  GITHUB_CLIENT_SECRET: '',
  ALLOW_DEV_LOGIN: 'true',
} as unknown as Env;

let handle: DbHandle;
const end = vi.fn(async () => {});
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  handle = await createTestDb();
  const deps: AppDeps = {
    openDb: async () => ({ db: handle.db, close: async () => {} }),
    room: async () => ({
      end,
      closeRound: async () => {},
      purge: async () => {},
      getReplayLog: async () => new Uint8Array([1]),
      showQuestion: async () => {},
      revealHint: async () => true,
      generateReports: async () => {},
      putBoardFile: async () => 'stored',
      getBoardFile: async () => null,
    }),
    matchmaker: async () => {
      throw new Error('Not used in these tests');
    },
  };
  app = createApp(deps);
});
afterAll(async () => {
  await handle.close();
});

function call(path: string, init: RequestInit & { cookie?: string; token?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('origin', ORIGIN);
  if (init.body) headers.set('content-type', 'application/json');
  if (init.cookie) headers.set('cookie', init.cookie);
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  return app.request(path, { ...init, headers }, env);
}

async function signUp(email: string, name: string): Promise<string> {
  const res = await call('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ email, name, password: 'correct-horse-battery' }),
  });
  expect(res.status).toBe(200);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  expect(cookie).toContain('session_token');
  return cookie;
}

describe('interview room flow', () => {
  let owner: string;
  let roomId: string;
  let slug: string;
  let guestToken: string;

  it('requires sign-in to create a room', async () => {
    const res = await call('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ title: 'Round 1', defaultLanguage: 'python' }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'unauthorized' } });
  });

  it('creates a room for a signed-in user', async () => {
    owner = await signUp('owner@example.test', 'Priya');
    const res = await call('/api/rooms', {
      method: 'POST',
      cookie: owner,
      body: JSON.stringify({ title: 'Frontend round – Asha', defaultLanguage: 'python' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { room: { id: string; slug: string }; link: string };
    roomId = body.room.id;
    slug = body.room.slug;
    expect(slug).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(body.link).toBe(`${ORIGIN}/r/${slug}`);
  });

  it('shows minimal public info for the join page', async () => {
    const res = await call(`/api/rooms/${slug}/public`);
    expect((await res.json()) as PublicRoom).toEqual({
      title: 'Frontend round – Asha',
      ownerName: 'Priya',
      status: 'scheduled',
      brand: null,
    });
  });

  it('refuses a guest join without consent or a name', async () => {
    const noConsent = await call(`/api/rooms/${slug}/join`, {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Asha' }),
    });
    expect(noConsent.status).toBe(400);
    const noName = await call(`/api/rooms/${slug}/join`, {
      method: 'POST',
      body: JSON.stringify({ consent: true }),
    });
    expect(noName.status).toBe(400);
  });

  it('lets a guest join as candidate and rejoin with their token', async () => {
    const res = await call(`/api/rooms/${slug}/join`, {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Asha', consent: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as JoinRoomResponse;
    expect(body.participant.role).toBe('candidate');
    expect(body.collabToken).toBeTruthy();
    guestToken = body.collabToken!;

    const again = await call(`/api/rooms/${slug}/join`, {
      method: 'POST',
      token: guestToken,
      body: JSON.stringify({ consent: true }),
    });
    expect(((await again.json()) as JoinRoomResponse).participant.id).toBe(body.participant.id);

    const me = await call(`/api/rooms/${slug}/me`, { token: guestToken });
    expect(((await me.json()) as JoinRoomResponse).participant.displayName).toBe('Asha');
  });

  it("lists the guest candidate on the owner's dashboard", async () => {
    const res = await call('/api/rooms', { cookie: owner });
    const [room] = (await res.json()) as RoomListItem[];
    expect(room).toMatchObject({ id: roomId, candidateName: 'Asha', score: null });
  });

  it("shows the owner's company branding to candidates", async () => {
    const logo = 'data:image/png;base64,iVBORw0KGgo=';
    const patch = await call('/api/me', {
      method: 'PATCH',
      cookie: owner,
      body: JSON.stringify({ brand: { companyName: 'Northwind', logo, color: '#0f766e' } }),
    });
    expect(patch.status).toBe(200);
    expect(((await patch.json()) as Me).brand).toEqual({
      companyName: 'Northwind',
      logo,
      color: '#0f766e',
    });

    const pub = (await (await call(`/api/rooms/${slug}/public`)).json()) as PublicRoom;
    expect(pub.brand?.companyName).toBe('Northwind');
    const me = (await (
      await call(`/api/rooms/${slug}/me`, { token: guestToken })
    ).json()) as JoinRoomResponse;
    expect(me.brand?.color).toBe('#0f766e');

    const svg = await call('/api/me', {
      method: 'PATCH',
      cookie: owner,
      body: JSON.stringify({ brand: { logo: 'data:image/svg+xml;base64,PHN2Zz4=' } }),
    });
    expect(svg.status).toBe(400);
  });

  it('gives the owner their owner role, not a new candidate row', async () => {
    const res = await call(`/api/rooms/${slug}/me`, { cookie: owner });
    expect(((await res.json()) as JoinRoomResponse).participant.role).toBe('owner');
  });

  it('rejects requests from foreign origins', async () => {
    const res = await app.request(
      `/api/rooms/${roomId}/end`,
      { method: 'POST', headers: { origin: 'https://evil.example', cookie: owner } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it('does not let the candidate end the session or see the replay early', async () => {
    const endRes = await call(`/api/rooms/${roomId}/end`, { method: 'POST', token: guestToken });
    expect(endRes.status).toBe(403);
    const replay = await call(`/api/rooms/${roomId}/replay/manifest`, { cookie: owner });
    expect(replay.status).toBe(403);
  });

  it('hides rooms from people who are not in them', async () => {
    const stranger = await signUp('stranger@example.test', 'Stranger');
    const res = await call(`/api/rooms/${roomId}/events`, { cookie: stranger });
    expect(res.status).toBe(404);
  });

  it('lets the owner end the session, then replay it', async () => {
    const res = await call(`/api/rooms/${roomId}/end`, { method: 'POST', cookie: owner });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { room: { status: string } }).room.status).toBe('ended');
    // Both the shared and the private document are closed.
    expect(end).toHaveBeenCalledTimes(2);

    const manifest = await call(`/api/rooms/${roomId}/replay/manifest`, { cookie: owner });
    expect(manifest.status).toBe(200);
    const log = await call(`/api/rooms/${roomId}/replay/log`, { cookie: owner });
    expect(log.headers.get('content-type')).toBe('application/octet-stream');

    const events = (await (
      await call(`/api/rooms/${roomId}/events`, { cookie: owner })
    ).json()) as RoomEvent[];
    expect(events.map((e) => e.type)).toContain('session_ended');

    // Replay is not shared with the candidate by default.
    const guestReplay = await call(`/api/rooms/${roomId}/replay/manifest`, { token: guestToken });
    expect(guestReplay.status).toBe(403);

    const lateJoin = await call(`/api/rooms/${slug}/join`, {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Late', consent: true }),
    });
    expect(lateJoin.status).toBe(409);
  });
});
