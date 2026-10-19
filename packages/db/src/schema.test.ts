import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from './index';
import { participants, rooms, users } from './schema';
import { createTestDb } from './testing';

let handle: DbHandle;
beforeAll(async () => {
  handle = await createTestDb();
});
afterAll(async () => {
  await handle.close();
});

describe('schema', () => {
  it('applies migrations and enforces one participant row per registered user per room', async () => {
    const { db } = handle;
    const [owner] = await db
      .insert(users)
      .values({ email: 'owner@example.test', name: 'Owner' })
      .returning();
    const [room] = await db
      .insert(rooms)
      .values({ slug: 'abcdefghij', ownerId: owner!.id, title: 'Round 1' })
      .returning();
    expect(room!.status).toBe('scheduled');
    expect(room!.retentionDays).toBe(30);

    await db
      .insert(participants)
      .values({ roomId: room!.id, userId: owner!.id, displayName: 'Owner', role: 'owner' });
    await expect(
      db
        .insert(participants)
        .values({ roomId: room!.id, userId: owner!.id, displayName: 'Again', role: 'candidate' }),
    ).rejects.toThrow();

    // Guests (no user id) are not limited by that index.
    await db.insert(participants).values([
      { roomId: room!.id, displayName: 'Guest A', role: 'candidate' },
      { roomId: room!.id, displayName: 'Guest B', role: 'candidate' },
    ]);
    const rows = await db.select().from(participants).where(eq(participants.roomId, room!.id));
    expect(rows).toHaveLength(3);
  });
});
