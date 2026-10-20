import type { DbHandle } from '@sidebyside/db';
import { createTestDb } from '@sidebyside/db/testing';
import { expect, vi } from 'vitest';
import { createApp } from '../app';
import type { AppDeps, RoomRpc } from '../context';

export const ORIGIN = 'http://localhost:5173';

export const testEnv = {
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

export interface RequestOptions extends RequestInit {
  cookie?: string;
  token?: string;
}

/** The API on an in-memory Postgres, with the room Durable Objects replaced by spies. */
export async function createHarness() {
  const handle: DbHandle = await createTestDb();
  const roomRpc = {
    end: vi.fn(async () => {}),
    getReplayLog: vi.fn(async () => new Uint8Array([1])),
    showQuestion: vi.fn(async () => {}),
    revealHint: vi.fn(async () => true),
  } satisfies RoomRpc;
  const deps: AppDeps = {
    openDb: async () => ({ db: handle.db, close: async () => {} }),
    room: async () => roomRpc,
  };
  const app = createApp(deps);

  const call = (path: string, init: RequestOptions = {}) => {
    const headers = new Headers(init.headers);
    headers.set('origin', ORIGIN);
    if (init.body) headers.set('content-type', 'application/json');
    if (init.cookie) headers.set('cookie', init.cookie);
    if (init.token) headers.set('authorization', `Bearer ${init.token}`);
    return app.request(path, { ...init, headers }, testEnv);
  };

  const json = async <T>(path: string, init: RequestOptions = {}, status = 200): Promise<T> => {
    const res = await call(path, init);
    const text = await res.text();
    expect(res.status, `${init.method ?? 'GET'} ${path}: ${text}`).toBe(status);
    return (text ? JSON.parse(text) : null) as T;
  };

  const signUp = async (email: string, name: string): Promise<string> => {
    const res = await call('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ email, name, password: 'correct-horse-battery' }),
    });
    expect(res.status).toBe(200);
    return res.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
  };

  return { app, call, json, signUp, db: handle.db, roomRpc, close: () => handle.close() };
}
