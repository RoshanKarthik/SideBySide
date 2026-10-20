/**
 * Guarantees: hidden test contents and the private interviewer document never reach a
 * candidate, and only interviewers can drive the interview.
 */
import { seedPublicQuestions } from '@sidebyside/db/seed';
import type {
  CreateRoomResponse,
  JoinRoomResponse,
  Question,
  QuestionSummary,
} from '@sidebyside/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authorizeConnection } from '../collab/connect';
import { CONNECTION_HEADER } from '../collab/protocol';
import { createHarness, testEnv } from '../testing/harness';

const SECRET_IN = 'HIDDEN-STDIN-7731';
const SECRET_OUT = 'HIDDEN-EXPECTED-7731';

let h: Awaited<ReturnType<typeof createHarness>>;
let owner: string;
let stranger: string;
let room: CreateRoomResponse['room'];
let guest: JoinRoomResponse;
let question: Question;

beforeAll(async () => {
  h = await createHarness();
  await seedPublicQuestions(h.db);
  owner = await h.signUp('owner2@example.test', 'Priya');
  stranger = await h.signUp('stranger2@example.test', 'Sam');
  room = (
    await h.json<CreateRoomResponse>(
      '/api/rooms',
      {
        method: 'POST',
        cookie: owner,
        body: JSON.stringify({ title: 'Toolkit', defaultLanguage: 'python' }),
      },
      201,
    )
  ).room;
  guest = await h.json<JoinRoomResponse>(`/api/rooms/${room.slug}/join`, {
    method: 'POST',
    body: JSON.stringify({ displayName: 'Asha', consent: true }),
  });
  question = await h.json<Question>(
    '/api/questions',
    {
      method: 'POST',
      cookie: owner,
      body: JSON.stringify({
        title: 'Sum two numbers',
        descriptionMd: 'Read two numbers and print their sum.',
        difficulty: 'easy',
        tags: ['basics'],
        starterCode: { python: 'print(sum(map(int, input().split())))\n' },
        hints: ['Split the line.'],
        testCases: [
          { stdin: '1 2', expectedStdout: '3', isHidden: false },
          { stdin: SECRET_IN, expectedStdout: SECRET_OUT, isHidden: true },
        ],
      }),
    },
    201,
  );
});
afterAll(async () => {
  await h.close();
});

describe('question bank', () => {
  it('lists my questions and the public bank', async () => {
    const list = await h.json<QuestionSummary[]>('/api/questions', { cookie: owner });
    expect(list.filter((q) => q.isPublic).length).toBeGreaterThanOrEqual(30);
    const mine = list.find((q) => q.id === question.id);
    expect(mine).toMatchObject({ mine: true, testCount: 2, hiddenTestCount: 1 });
  });

  it('shows the owner their hidden tests, and nobody else', async () => {
    const own = await h.json<Question>(`/api/questions/${question.id}`, { cookie: owner });
    expect(JSON.stringify(own)).toContain(SECRET_OUT);
    const res = await h.call(`/api/questions/${question.id}`, { cookie: stranger });
    expect(res.status).toBe(404);
  });

  it('hides public-bank hidden tests from the question API', async () => {
    const list = await h.json<QuestionSummary[]>('/api/questions?scope=public', {
      cookie: stranger,
    });
    const twoSum = list.find((q) => q.title === 'Two Sum')!;
    const full = await h.json<Question>(`/api/questions/${twoSum.id}`, { cookie: stranger });
    expect(full.hiddenTestCount).toBeGreaterThanOrEqual(2);
    expect(full.testCases.every((t) => !t.isHidden)).toBe(true);
  });

  it('lets only the owner edit or delete', async () => {
    const res = await h.call(`/api/questions/${question.id}`, {
      method: 'DELETE',
      cookie: stranger,
    });
    expect(res.status).toBe(403);
  });
});

describe('interviewer tools in a room', () => {
  it('shows a question without sending any test data to the room', async () => {
    await h.json(`/api/rooms/${room.id}/questions/${question.id}/show`, {
      method: 'POST',
      cookie: owner,
    });
    const [, input] = h.roomRpc.showQuestion.mock.calls.at(-1)! as unknown as [unknown, object];
    const sent = JSON.stringify(input);
    expect(sent).toContain('Sum two numbers');
    expect(sent).not.toContain(SECRET_IN);
    expect(sent).not.toContain(SECRET_OUT);
  });

  it('refuses every interviewer tool to the candidate', async () => {
    const token = guest.collabToken!;
    const attempts = [
      h.call(`/api/rooms/${room.id}/questions/${question.id}`, { token }),
      h.call(`/api/rooms/${room.id}/questions`, { token }),
      h.call(`/api/rooms/${room.id}/questions/${question.id}/show`, { method: 'POST', token }),
      h.call(`/api/rooms/${room.id}/questions/${question.id}/hints/0/reveal`, {
        method: 'POST',
        token,
      }),
      h.call(`/api/rooms/${room.id}/invite`, { token }),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(403);
      expect(await res.text()).not.toContain('HIDDEN');
    }
    // Without an account, the question API is closed altogether.
    expect((await h.call(`/api/questions/${question.id}`, { token })).status).toBe(401);
  });

  it('gives interviewers the hidden tests to run in their browser', async () => {
    const full = await h.json<Question>(`/api/rooms/${room.id}/questions/${question.id}`, {
      cookie: owner,
    });
    expect(full.testCases.map((t) => t.stdin)).toContain(SECRET_IN);
  });

  it('reveals hints by index', async () => {
    await h.json(`/api/rooms/${room.id}/questions/${question.id}/hints/0/reveal`, {
      method: 'POST',
      cookie: owner,
    });
    expect(h.roomRpc.revealHint).toHaveBeenLastCalledWith(
      expect.objectContaining({ roomId: room.id }),
      question.id,
      0,
      'Split the line.',
    );
    const missing = await h.call(`/api/rooms/${room.id}/questions/${question.id}/hints/5/reveal`, {
      method: 'POST',
      cookie: owner,
    });
    expect(missing.status).toBe(404);
  });
});

describe('co-interviewer invite', () => {
  it('upgrades a signed-in user who has the link', async () => {
    const { link } = await h.json<{ link: string }>(`/api/rooms/${room.id}/invite`, {
      cookie: owner,
    });
    const token = new URL(link).searchParams.get('invite')!;
    const bad = await h.call(`/api/rooms/${room.slug}/co-interviewer`, {
      method: 'POST',
      cookie: stranger,
      body: JSON.stringify({ token: 'wrong' }),
    });
    expect(bad.status).toBe(400);
    const anon = await h.call(`/api/rooms/${room.slug}/co-interviewer`, {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    expect(anon.status).toBe(401);
    const joined = await h.json<JoinRoomResponse>(`/api/rooms/${room.slug}/co-interviewer`, {
      method: 'POST',
      cookie: stranger,
      body: JSON.stringify({ token }),
    });
    expect(joined.participant.role).toBe('interviewer');
    const tests = await h.json<Question>(`/api/rooms/${room.id}/questions/${question.id}`, {
      cookie: stranger,
    });
    expect(tests.testCases).toHaveLength(2);
  });
});

describe('realtime connections', () => {
  const openDb = async () => ({ db: h.db, close: async () => {} });
  const upgrade = (part: string, init: { token?: string; cookie?: string }) => {
    const url = new URL(`http://localhost/collab/room/${room.id}--${part}`);
    if (init.token) url.searchParams.set('token', init.token);
    const headers = new Headers({ upgrade: 'websocket' });
    if (init.cookie) headers.set('cookie', init.cookie);
    // A client trying to smuggle its own identity header must be overwritten.
    headers.set(CONNECTION_HEADER, JSON.stringify({ role: 'owner' }));
    return authorizeConnection(
      new Request(url, { headers }),
      { name: `${room.id}--${part}` },
      testEnv,
      openDb,
    );
  };

  it('keeps candidates out of the private document', async () => {
    const res = await upgrade('private', { token: guest.collabToken! });
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
  });

  it('lets the candidate into the shared document as a candidate', async () => {
    const res = await upgrade('shared', { token: guest.collabToken! });
    expect(res).toBeInstanceOf(Request);
    const info = JSON.parse((res as Request).headers.get(CONNECTION_HEADER)!);
    expect(info).toMatchObject({ role: 'candidate', participantId: guest.participant.id });
  });

  it('lets interviewers into the private document', async () => {
    const res = await upgrade('private', { cookie: owner });
    expect(res).toBeInstanceOf(Request);
    expect(JSON.parse((res as Request).headers.get(CONNECTION_HEADER)!).role).toBe('owner');
  });

  it('rejects strangers and unknown documents', async () => {
    expect(((await upgrade('shared', {})) as Response).status).toBe(401);
    const res = await authorizeConnection(
      new Request(`http://localhost/collab/room/x`),
      { name: `${room.id}--secret` },
      testEnv,
      openDb,
    );
    expect((res as Response).status).toBe(404);
  });
});
