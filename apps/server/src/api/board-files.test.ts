/**
 * Whiteboard images: room members upload and fetch them by id; the room's document decides
 * whether it takes them (ended, locked, full).
 */
import { eq, rooms } from '@sidebyside/db';
import {
  LIMITS,
  type BoardFile,
  type CreateRoomResponse,
  type JoinRoomResponse,
} from '@sidebyside/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness } from '../testing/harness';

let h: Awaited<ReturnType<typeof createHarness>>;
let owner: string;
let room: CreateRoomResponse['room'];
let guest: JoinRoomResponse;

// A 1×1 transparent PNG.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const image = (over: Partial<BoardFile> = {}): BoardFile => ({
  id: 'f3a9c0de12',
  mimeType: 'image/png',
  dataURL: PNG,
  created: 1_700_000_000_000,
  ...over,
});
const upload = (file: unknown, auth: { cookie?: string; token?: string }) =>
  h.call(`/api/rooms/${room.id}/board-files`, {
    method: 'POST',
    body: JSON.stringify(file),
    ...auth,
  });

beforeAll(async () => {
  h = await createHarness();
  owner = await h.signUp('board-owner@example.test', 'Priya');
  ({ room } = await h.json<CreateRoomResponse>(
    '/api/rooms',
    {
      method: 'POST',
      cookie: owner,
      body: JSON.stringify({ title: 'Design round', defaultLanguage: 'python' }),
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

describe('whiteboard images', () => {
  it('lets a candidate add an image that everyone in the room can fetch', async () => {
    const res = await upload(image(), { token: guest.collabToken! });
    expect(res.status).toBe(204);
    expect(h.roomRpc.putBoardFile).toHaveBeenLastCalledWith(image(), false);
    const fetched = await h.json<BoardFile>(`/api/rooms/${room.id}/board-files/f3a9c0de12`, {
      cookie: owner,
    });
    expect(fetched).toEqual(image());
  });

  it('keeps images away from people outside the room', async () => {
    const stranger = await h.signUp('board-stranger@example.test', 'Olu');
    await h.json(`/api/rooms/${room.id}/board-files/f3a9c0de12`, { cookie: stranger }, 404);
    const res = await upload(image({ id: 'stranger1' }), { cookie: stranger });
    expect(res.status).toBe(404);
  });

  it('refuses SVG, mismatched data URLs and oversized images', async () => {
    const svg = await upload(
      image({
        mimeType: 'image/svg+xml' as BoardFile['mimeType'],
        dataURL: 'data:image/svg+xml;base64,PHN2Zz4=',
      }),
      { cookie: owner },
    );
    expect(svg.status).toBe(400);
    const mismatch = await upload(image({ mimeType: 'image/jpeg' }), { cookie: owner });
    expect(mismatch.status).toBe(400);
    const huge = await upload(image({ dataURL: PNG + 'A'.repeat(LIMITS.boardImageChars) }), {
      cookie: owner,
    });
    expect(huge.status).toBe(400);
  });

  it('passes on what the room decides: locked, full', async () => {
    h.roomRpc.putBoardFile.mockResolvedValueOnce('locked');
    expect((await upload(image({ id: 'x1' }), { token: guest.collabToken! })).status).toBe(403);
    h.roomRpc.putBoardFile.mockResolvedValueOnce('full');
    const full = await upload(image({ id: 'x2' }), { cookie: owner });
    expect(full.status).toBe(409);
    expect(await full.json()).toMatchObject({ error: { code: 'board_full' } });
  });

  it('takes no new images once the session has ended, but still serves the old ones', async () => {
    await h.db.update(rooms).set({ status: 'ended' }).where(eq(rooms.id, room.id));
    expect((await upload(image({ id: 'late' }), { cookie: owner })).status).toBe(409);
    await h.json(`/api/rooms/${room.id}/board-files/f3a9c0de12`, { cookie: owner });
    await h.json(`/api/rooms/${room.id}/board-files/missing`, { cookie: owner }, 404);
  });
});
