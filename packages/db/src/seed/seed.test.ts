import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '../index';
import { questions, testCases } from '../schema';
import { createTestDb } from '../testing';
import { buildSeedQuestions } from './build';
import { seedPublicQuestions } from './seed';

describe('public question bank', () => {
  const built = buildSeedQuestions();

  it('has about thirty questions with valid tests', () => {
    expect(built.length).toBeGreaterThanOrEqual(30);
    expect(new Set(built.map((q) => q.seedKey)).size).toBe(built.length);
    for (const q of built) {
      const tests = q.testCases ?? [];
      expect(tests.length, q.seedKey).toBeGreaterThanOrEqual(4);
      expect(tests.length, q.seedKey).toBeLessThanOrEqual(8);
      expect(tests.filter((t) => t.isHidden).length, q.seedKey).toBeGreaterThanOrEqual(2);
      expect(tests.filter((t) => !t.isHidden).length, q.seedKey).toBeGreaterThanOrEqual(2);
      for (const t of tests) expect(typeof t.expectedStdout, q.seedKey).toBe('string');
      for (const lang of ['python', 'javascript', 'java', 'cpp']) {
        expect(q.starterCode?.[lang], `${q.seedKey} ${lang}`).toBeTruthy();
      }
      expect(q.descriptionMd).toContain('### Example');
    }
  });

  it('reference solutions give the classic answers', () => {
    const byKey = new Map(built.map((q) => [q.seedKey, q]));
    const expected = (key: string, i: number) => byKey.get(key)!.testCases![i]!.expectedStdout;
    expect(expected('two-sum', 0)).toBe('0 1');
    expect(expected('maximum-subarray', 0)).toBe('6');
    expect(expected('trapping-rain-water', 0)).toBe('6');
    expect(expected('edit-distance', 0)).toBe('3');
    expect(expected('n-queens-count', 0)).toBe('2');
    expect(expected('n-queens-count', 5)).toBe('724');
    expect(expected('merge-intervals', 0)).toBe('1 6\n8 10\n15 18');
    expect(expected('climbing-stairs', 4)).toBe('1836311903');
  });

  describe('seeding', () => {
    let handle: DbHandle;
    beforeAll(async () => {
      handle = await createTestDb();
    });
    afterAll(async () => {
      await handle.close();
    });

    it('is idempotent', async () => {
      await seedPublicQuestions(handle.db);
      await seedPublicQuestions(handle.db);
      const [q] = await handle.db
        .select({ n: count() })
        .from(questions)
        .where(eq(questions.isPublic, true));
      expect(q?.n).toBe(built.length);
      const [t] = await handle.db.select({ n: count() }).from(testCases);
      expect(t?.n).toBe(built.reduce((sum, b) => sum + (b.testCases?.length ?? 0), 0));
    });
  });
});
