import type { CreateRoomResponse, IceServersResponse } from '@sidebyside/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHarness, testEnv } from '../testing/harness';
import { STUN_SERVERS, iceServersFor } from './ice-servers';

const withTurn = { ...testEnv, TURN_KEY_ID: 'key123', TURN_KEY_API_TOKEN: 'secret' } as Env;
const cloudflareAnswer = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    {
      urls: [
        'turn:turn.cloudflare.com:3478?transport=udp',
        'turn:turn.cloudflare.com:53?transport=udp',
        'turns:turn.cloudflare.com:443?transport=tcp',
      ],
      username: 'u',
      credential: 'c',
    },
  ],
};

describe('iceServersFor', () => {
  it('uses STUN only when no TURN key is set', async () => {
    const fetcher = vi.fn();
    expect(await iceServersFor(testEnv, fetcher as unknown as typeof fetch)).toEqual(STUN_SERVERS);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('asks Cloudflare for short-lived credentials and drops port 53', async () => {
    const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) =>
      Response.json(cloudflareAnswer, { status: 201 }),
    );
    const servers = await iceServersFor(withTurn, fetcher as unknown as typeof fetch);
    expect(String(fetcher.mock.calls[0]![0])).toBe(
      'https://rtc.live.cloudflare.com/v1/turn/keys/key123/credentials/generate-ice-servers',
    );
    expect(new Headers(fetcher.mock.calls[0]![1]!.headers).get('authorization')).toBe(
      'Bearer secret',
    );
    expect(servers).toEqual([
      { urls: ['stun:stun.cloudflare.com:3478'] },
      {
        urls: [
          'turn:turn.cloudflare.com:3478?transport=udp',
          'turns:turn.cloudflare.com:443?transport=tcp',
        ],
        username: 'u',
        credential: 'c',
      },
    ]);
  });

  it('falls back to STUN when Cloudflare fails', async () => {
    const fetcher = vi.fn(async () => new Response('nope', { status: 500 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await iceServersFor(withTurn, fetcher as unknown as typeof fetch)).toEqual(STUN_SERVERS);
  });
});

describe('GET /rooms/:id/ice-servers', () => {
  let h: Awaited<ReturnType<typeof createHarness>>;
  let owner: string;
  let room: CreateRoomResponse['room'];

  beforeAll(async () => {
    h = await createHarness();
    owner = await h.signUp('ice-owner@example.test', 'Priya');
    ({ room } = await h.json<CreateRoomResponse>(
      '/api/rooms',
      {
        method: 'POST',
        cookie: owner,
        body: JSON.stringify({ title: 'Call', defaultLanguage: 'python' }),
      },
      201,
    ));
  });
  afterAll(async () => {
    await h.close();
  });

  it('gives room members the servers, and nobody else', async () => {
    const body = await h.json<IceServersResponse>(`/api/rooms/${room.id}/ice-servers`, {
      cookie: owner,
    });
    expect(body.iceServers).toEqual(STUN_SERVERS);
    const stranger = await h.signUp('ice-stranger@example.test', 'Olu');
    await h.json(`/api/rooms/${room.id}/ice-servers`, { cookie: stranger }, 404);
  });
});
