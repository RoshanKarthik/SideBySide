/**
 * Practice mode: matching, per-round roles (and so per-round privacy), swapping roles,
 * ratings; plus the session summary, room deletion and account export/deletion.
 */
import { seedPublicQuestions } from '@sidebyside/db/seed';
import { eq, rooms, rubricScores } from '@sidebyside/db';
import type {
  CreateRoomResponse,
  JoinRoomResponse,
  PracticeStats,
  QueueStatus,
  QuestionSummary,
  SessionSummary,
} from '@sidebyside/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authorizeConnection } from '../collab/connect';
import { CONNECTION_HEADER } from '../collab/protocol';
import { createHarness, testEnv } from '../testing/harness';

let h: Awaited<ReturnType<typeof createHarness>>;
let ravi: string;
let meera: string;
let outsider: string;

const prefs = { topic: 'arrays', difficulty: 'easy', language: 'python' } as const;

beforeAll(async () => {
  h = await createHarness();
  await seedPublicQuestions(h.db);
  ravi = await h.signUp('ravi@example.test', 'Ravi');
  meera = await h.signUp('meera@example.test', 'Meera');
  outsider = await h.signUp('out@example.test', 'Olu');
});
afterAll(async () => {
  await h.close();
});

const me = (slug: string, cookie: string) =>
  h.json<JoinRoomResponse>(`/api/rooms/${slug}/me`, { cookie });

describe('practice mode', () => {
  let slug = '';
  let roomId = '';

  it('waits alone, then matches two compatible people into one room', async () => {
    const first = await h.json<QueueStatus>('/api/practice/queue', {
      method: 'POST',
      cookie: ravi,
      body: JSON.stringify(prefs),
    });
    expect(first).toMatchObject({ status: 'waiting', waiting: 1, relaxed: false });

    // Different difficulty never matches.
    const other = await h.json<QueueStatus>('/api/practice/queue', {
      method: 'POST',
      cookie: outsider,
      body: JSON.stringify({ ...prefs, difficulty: 'hard' }),
    });
    expect(other.status).toBe('waiting');

    const second = await h.json<QueueStatus>('/api/practice/queue', {
      method: 'POST',
      cookie: meera,
      body: JSON.stringify({ ...prefs, topic: 'mixed' }),
    });
    expect(second).toMatchObject({ status: 'matched', partnerName: 'Ravi' });
    const firstNow = await h.json<QueueStatus>('/api/practice/queue/status', { cookie: ravi });
    expect(firstNow).toMatchObject({ status: 'matched', partnerName: 'Meera' });
    if (second.status !== 'matched' || firstNow.status !== 'matched') throw new Error('no match');
    expect(firstNow.roomSlug).toBe(second.roomSlug);
    slug = second.roomSlug;

    await h.json('/api/practice/queue', { method: 'DELETE', cookie: outsider }, 204);
    expect(await h.json<QueueStatus>('/api/practice/queue/status', { cookie: outsider })).toEqual({
      status: 'idle',
    });
  });

  it('makes whoever waited longer interview first', async () => {
    const r = await me(slug, ravi);
    const m = await me(slug, meera);
    roomId = r.room.id;
    expect(r.room).toMatchObject({
      mode: 'practice',
      currentRound: 1,
      title: 'Practice · Arrays · Easy',
    });
    expect(r.participant.role).toBe('interviewer');
    expect(m.participant.role).toBe('candidate');
  });

  it('keeps third people out of a practice room', async () => {
    await h.json(
      `/api/rooms/${slug}/join`,
      { method: 'POST', cookie: outsider, body: JSON.stringify({ consent: true }) },
      403,
    );
  });

  it('gives the private document only to this round’s interviewer', async () => {
    const upgrade = (name: string, cookie: string) =>
      authorizeConnection(
        new Request(`http://localhost/collab/room/${name}`, {
          headers: { upgrade: 'websocket', cookie },
        }),
        { name },
        testEnv,
        async () => ({ db: h.db, close: async () => {} }),
      );
    const asRavi = await upgrade(`${roomId}--private`, ravi);
    expect(asRavi).toBeInstanceOf(Request);
    expect(JSON.parse((asRavi as Request).headers.get(CONNECTION_HEADER)!)).toMatchObject({
      role: 'interviewer',
      round: 1,
    });
    expect(((await upgrade(`${roomId}--private`, meera)) as Response).status).toBe(403);
    // Round 2 isn't live yet.
    expect(((await upgrade(`${roomId}--shared-r2`, meera)) as Response).status).toBe(410);
  });

  it('shows hidden tests only to this round’s interviewer', async () => {
    const list = await h.json<QuestionSummary[]>('/api/questions?scope=public', { cookie: ravi });
    const qid = list[0]!.id;
    await h.json(`/api/rooms/${roomId}/questions/${qid}`, { cookie: ravi });
    await h.json(`/api/rooms/${roomId}/questions/${qid}`, { cookie: meera }, 403);
  });

  it('swaps roles for round 2, in fresh documents', async () => {
    const before = h.roomRpc.closeRound.mock.calls.length;
    const res = await h.json<{ room: { currentRound: number } }>(
      `/api/rooms/${roomId}/rounds/next`,
      { method: 'POST', cookie: meera },
    );
    expect(res.room.currentRound).toBe(2);
    // Round 1's shared and private documents were closed.
    expect(h.roomRpc.closeRound.mock.calls.length - before).toBe(2);
    expect((await me(slug, ravi)).participant.role).toBe('candidate');
    expect((await me(slug, meera)).participant.role).toBe('interviewer');
    // There is no round 3.
    await h.json(`/api/rooms/${roomId}/rounds/next`, { method: 'POST', cookie: ravi }, 409);
  });

  it('shows each peer only the rubric of the round they interviewed', async () => {
    await h.db.insert(rubricScores).values([
      { roomId, roundNumber: 1, criterion: 'Approach', score: 3, comment: 'R1 by Ravi' },
      { roomId, roundNumber: 2, criterion: 'Approach', score: 4, comment: 'R2 by Meera' },
    ]);
    const s = await h.json<SessionSummary>(`/api/rooms/${roomId}/summary`, { cookie: ravi });
    expect(s.rounds.map((r) => [r.roundNumber, r.mine, r.interviewer, r.candidate])).toEqual([
      [1, true, 'Ravi', 'Meera'],
      [2, false, 'Meera', 'Ravi'],
    ]);
    expect(s.rounds[0]!.rubric?.[0]?.comment).toBe('R1 by Ravi');
    expect(s.rounds[1]!.rubric).toBeNull();
    expect(JSON.stringify(s)).not.toContain('R2 by Meera');
  });

  it('takes ratings only after the session ends, and shows averages to the person rated', async () => {
    const rating = { problemSolving: 4, communication: 5, interviewing: 3, comment: 'Nice' };
    await h.json(
      `/api/rooms/${roomId}/ratings`,
      { method: 'POST', cookie: ravi, body: JSON.stringify(rating) },
      403,
    );
    await h.json(`/api/rooms/${roomId}/end`, { method: 'POST', cookie: meera });
    await h.json(`/api/rooms/${roomId}/ratings`, {
      method: 'POST',
      cookie: ravi,
      body: JSON.stringify(rating),
    });
    const stats = await h.json<PracticeStats>('/api/practice/stats', { cookie: meera });
    expect(stats.averages).toMatchObject({ problemSolving: 4, communication: 5, count: 1 });
    expect(stats.history[0]).toMatchObject({ partnerName: 'Ravi', rated: false });
    const ravisStats = await h.json<PracticeStats>('/api/practice/stats', { cookie: ravi });
    expect(ravisStats.history[0]!.rated).toBe(true);
    expect(ravisStats.averages).toBeNull();
  });
});

describe('sessions', () => {
  let owner: string;
  let room: CreateRoomResponse['room'];
  let guest: JoinRoomResponse;

  beforeAll(async () => {
    owner = await h.signUp('sess@example.test', 'Priya');
    room = (
      await h.json<CreateRoomResponse>(
        '/api/rooms',
        {
          method: 'POST',
          cookie: owner,
          body: JSON.stringify({ title: 'S', defaultLanguage: 'python' }),
        },
        201,
      )
    ).room;
    guest = await h.json<JoinRoomResponse>(`/api/rooms/${room.slug}/join`, {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Asha', consent: true }),
    });
  });

  it('shows the summary to interviewers only', async () => {
    const s = await h.json<SessionSummary>(`/api/rooms/${room.id}/summary`, { cookie: owner });
    expect(s.participants.map((p) => [p.displayName, p.role, p.isGuest])).toEqual([
      ['Priya', 'owner', false],
      ['Asha', 'candidate', true],
    ]);
    expect(s).toMatchObject({ canDelete: true, myRole: 'owner' });
    await h.json(`/api/rooms/${room.id}/summary`, { token: guest.collabToken! }, 403);
  });

  it('refuses to delete someone else’s room, then deletes everything, even while live', async () => {
    await h.db.update(rooms).set({ status: 'live' }).where(eq(rooms.id, room.id));
    await h.json(`/api/rooms/${room.id}`, { method: 'DELETE', token: guest.collabToken! }, 403);
    const purges = h.roomRpc.purge.mock.calls.length;
    await h.json(`/api/rooms/${room.id}`, { method: 'DELETE', cookie: owner }, 204);
    expect(h.roomRpc.purge.mock.calls.length - purges).toBe(2);
    await h.json(`/api/rooms/${room.id}/summary`, { cookie: owner }, 404);
  });
});

describe('account', () => {
  it('exports my data without secrets', async () => {
    const cookie = await h.signUp('exp@example.test', 'Exa');
    await h.json(
      '/api/rooms',
      { method: 'POST', cookie, body: JSON.stringify({ title: 'Mine', defaultLanguage: 'go' }) },
      201,
    );
    const res = await h.call('/api/me/export', { cookie });
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const data = (await res.json()) as { profile: { email: string }; ownedRooms: object[] };
    expect(data.profile.email).toBe('exp@example.test');
    expect(data.ownedRooms).toHaveLength(1);
    expect(JSON.stringify(data)).not.toMatch(/coInterviewerToken|password/i);
  });

  it('deletes the account after confirmation, handing practice rooms to the partner', async () => {
    await h.json(
      '/api/me',
      { method: 'DELETE', cookie: ravi, body: JSON.stringify({ confirm: 'wrong' }) },
      400,
    );
    await h.json(
      '/api/me',
      { method: 'DELETE', cookie: ravi, body: JSON.stringify({ confirm: 'RAVI@example.test' }) },
      204,
    );
    await h.json('/api/me', { cookie: ravi }, 401);
    // Meera still has her practice session.
    const stats = await h.json<PracticeStats>('/api/practice/stats', { cookie: meera });
    expect(stats.history).toHaveLength(1);
  });
});
