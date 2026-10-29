/**
 * The server-side code runner for compiled languages: room members of a live room only, limited
 * per person by the room, and only for languages that don't run in the browser.
 */
import { eq, rooms } from '@sidebyside/db';
import type { CreateRoomResponse, JoinRoomResponse, RunOutput } from '@sidebyside/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness } from '../testing/harness';

let h: Awaited<ReturnType<typeof createHarness>>;
let owner: string;
let room: CreateRoomResponse['room'];
let guest: JoinRoomResponse;

const java = { language: 'java', source: 'class Main {}', stdin: 'Asha\n' };
const execute = (body: unknown, auth: { cookie?: string; token?: string }) =>
  h.call(`/api/rooms/${room.id}/execute`, { method: 'POST', body: JSON.stringify(body), ...auth });

beforeAll(async () => {
  h = await createHarness();
  owner = await h.signUp('exec-owner@example.test', 'Priya');
  ({ room } = await h.json<CreateRoomResponse>(
    '/api/rooms',
    {
      method: 'POST',
      cookie: owner,
      body: JSON.stringify({ title: 'Java round', defaultLanguage: 'java' }),
    },
    201,
  ));
  guest = await h.json<JoinRoomResponse>(`/api/rooms/${room.slug}/join`, {
    method: 'POST',
    body: JSON.stringify({ displayName: 'Asha', consent: true }),
  });
});
afterAll(async () => {
  await h.close();
});

describe('running compiled languages on the server', () => {
  it('waits for the session to go live', async () => {
    expect((await execute(java, { token: guest.collabToken! })).status).toBe(409);
    await h.db.update(rooms).set({ status: 'live' }).where(eq(rooms.id, room.id));
  });

  it('runs a candidate’s Java and returns the output', async () => {
    const res = await execute(java, { token: guest.collabToken! });
    expect(res.status).toBe(200);
    expect(((await res.json()) as RunOutput).stdout).toBe('Asha\n');
    expect(h.execution.run).toHaveBeenLastCalledWith(java);
    expect(h.roomRpc.allowExecution).toHaveBeenLastCalledWith(guest.participant.id);
  });

  it('is only for people in the room, and only for compiled languages', async () => {
    const stranger = await h.signUp('exec-stranger@example.test', 'Olu');
    expect((await execute(java, { cookie: stranger })).status).toBe(404);
    const python = await execute({ ...java, language: 'python' }, { cookie: owner });
    expect(python.status).toBe(400);
  });

  it('passes on the room’s rate limit', async () => {
    h.roomRpc.allowExecution.mockResolvedValueOnce('limited');
    expect((await execute(java, { cookie: owner })).status).toBe(429);
  });

  it('says so when the code runner fails', async () => {
    h.execution.run.mockRejectedValueOnce(new Error('timeout'));
    const res = await execute(java, { cookie: owner });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: { code: 'runner_unavailable' } });
  });

  it('refuses when the server has it turned off', async () => {
    const off = await createHarness({ REMOTE_EXECUTION: 'off' });
    const cookie = await off.signUp('exec-off@example.test', 'Priya');
    const { room: offRoom } = await off.json<CreateRoomResponse>(
      '/api/rooms',
      { method: 'POST', cookie, body: JSON.stringify({ title: 'Go', defaultLanguage: 'go' }) },
      201,
    );
    await off.db.update(rooms).set({ status: 'live' }).where(eq(rooms.id, offRoom.id));
    const res = await off.call(`/api/rooms/${offRoom.id}/execute`, {
      method: 'POST',
      cookie,
      body: JSON.stringify({ ...java, language: 'go' }),
    });
    expect(res.status).toBe(503);
    await off.close();
  });
});
