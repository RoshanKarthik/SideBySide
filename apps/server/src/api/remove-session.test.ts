/**
 * Deleting and removing sessions: the owner of an interview deletes it for everyone at any time;
 * everyone else with an account removes it from their own sessions, and a practice room is
 * deleted once nobody with an account is left in it.
 */
import { eq, practiceRatings, rooms } from '@sidebyside/db';
import type {
  CreateRoomResponse,
  JoinRoomResponse,
  QueueStatus,
  RoomListItem,
  SessionSummary,
} from '@sidebyside/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness } from '../testing/harness';

let h: Awaited<ReturnType<typeof createHarness>>;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

const myRooms = async (cookie: string) =>
  (await h.json<RoomListItem[]>('/api/rooms', { cookie })).map((r) => r.id);
const roomExists = async (id: string) =>
  (await h.db.select().from(rooms).where(eq(rooms.id, id))).length === 1;
const purges = () => h.roomRpc.purge.mock.calls.length;

describe('practice sessions', () => {
  let asha: string;
  let ravi: string;
  let roomId: string;

  beforeAll(async () => {
    asha = await h.signUp('remove-asha@example.test', 'Asha');
    ravi = await h.signUp('remove-ravi@example.test', 'Ravi');
    const prefs = { topic: 'arrays', difficulty: 'easy', language: 'python' };
    await h.json<QueueStatus>('/api/practice/queue', {
      method: 'POST',
      cookie: asha,
      body: JSON.stringify(prefs),
    });
    const matched = await h.json<QueueStatus>('/api/practice/queue', {
      method: 'POST',
      cookie: ravi,
      body: JSON.stringify(prefs),
    });
    if (matched.status !== 'matched') throw new Error('Expected a match');
    const me = await h.json<JoinRoomResponse>(`/api/rooms/${matched.roomSlug}/me`, {
      cookie: asha,
    });
    roomId = me.room.id;
    // End the session and let both peers rate each other.
    await h.db.update(rooms).set({ status: 'ended' }).where(eq(rooms.id, roomId));
    const rating = { problemSolving: 4, communication: 5, interviewing: 4, comment: '' };
    for (const cookie of [asha, ravi]) {
      await h.json(`/api/rooms/${roomId}/ratings`, {
        method: 'POST',
        cookie,
        body: JSON.stringify(rating),
      });
    }
  });

  it('offers peers removal, not deletion', async () => {
    const summary = await h.json<SessionSummary>(`/api/rooms/${roomId}/summary`, { cookie: asha });
    expect(summary).toMatchObject({ canDelete: false, canRemove: true });
    await h.json(`/api/rooms/${roomId}`, { method: 'DELETE', cookie: asha }, 403);
  });

  it('removes the session for one peer and keeps it for the other', async () => {
    const before = purges();
    await h.json(`/api/rooms/${roomId}/me`, { method: 'DELETE', cookie: asha }, 204);
    expect(await myRooms(asha)).not.toContain(roomId);
    expect(await myRooms(ravi)).toContain(roomId);
    expect(await roomExists(roomId)).toBe(true);
    expect(purges()).toBe(before);
    // Both ratings involved Asha, so both are gone; the room now belongs to Ravi.
    expect(
      await h.db.select().from(practiceRatings).where(eq(practiceRatings.roomId, roomId)),
    ).toHaveLength(0);
    const [row] = await h.db.select().from(rooms).where(eq(rooms.id, roomId));
    const raviUser = await h.json<{ id: string }>('/api/me', { cookie: ravi });
    expect(row!.ownerId).toBe(raviUser.id);
    // Asha can no longer open it.
    await h.json(`/api/rooms/${roomId}/summary`, { cookie: asha }, 404);
  });

  it('deletes the room for good once the last peer removes it too', async () => {
    const before = purges();
    await h.json(`/api/rooms/${roomId}/me`, { method: 'DELETE', cookie: ravi }, 204);
    expect(await roomExists(roomId)).toBe(false);
    expect(purges() - before).toBe(2);
    expect(await myRooms(ravi)).not.toContain(roomId);
  });
});

describe('interview sessions', () => {
  let owner: string;
  let colleague: string;
  let room: CreateRoomResponse['room'];
  let guest: JoinRoomResponse;

  beforeAll(async () => {
    owner = await h.signUp('remove-owner@example.test', 'Priya');
    colleague = await h.signUp('remove-colleague@example.test', 'Dev');
    ({ room } = await h.json<CreateRoomResponse>(
      '/api/rooms',
      {
        method: 'POST',
        cookie: owner,
        body: JSON.stringify({ title: 'Backend round', defaultLanguage: 'python' }),
      },
      201,
    ));
    guest = await h.json<JoinRoomResponse>(`/api/rooms/${room.slug}/join`, {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Asha', consent: true }),
    });
    const { link } = await h.json<{ link: string }>(`/api/rooms/${room.id}/invite`, {
      cookie: owner,
    });
    await h.json(`/api/rooms/${room.slug}/co-interviewer`, {
      method: 'POST',
      cookie: colleague,
      body: JSON.stringify({ token: new URL(link).searchParams.get('invite') }),
    });
  });

  it('lets a co-interviewer remove the session without deleting it', async () => {
    expect(await myRooms(colleague)).toContain(room.id);
    await h.json(`/api/rooms/${room.id}/me`, { method: 'DELETE', cookie: colleague }, 204);
    expect(await myRooms(colleague)).not.toContain(room.id);
    expect(await myRooms(owner)).toContain(room.id);
    expect(await roomExists(room.id)).toBe(true);
  });

  it('does not let a guest or the owner use removal', async () => {
    await h.json(`/api/rooms/${room.id}/me`, { method: 'DELETE', token: guest.collabToken! }, 403);
    await h.json(`/api/rooms/${room.id}/me`, { method: 'DELETE', cookie: owner }, 403);
  });

  it('lets the owner delete a session that is still live', async () => {
    await h.db.update(rooms).set({ status: 'live' }).where(eq(rooms.id, room.id));
    const before = purges();
    await h.json(`/api/rooms/${room.id}`, { method: 'DELETE', cookie: owner }, 204);
    expect(purges() - before).toBe(2);
    expect(await roomExists(room.id)).toBe(false);
  });
});
