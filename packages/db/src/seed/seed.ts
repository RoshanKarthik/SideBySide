import { eq } from 'drizzle-orm';
import type { Database } from '../index';
import { questions, testCases } from '../schema';
import { buildSeedQuestions } from './build';

/**
 * Inserts or updates the public practice bank. Safe to run repeatedly: questions are matched by
 * their seed key and their test cases are replaced.
 */
export async function seedPublicQuestions(db: Database): Promise<number> {
  const built = buildSeedQuestions();
  for (const q of built) {
    await db.transaction(async (tx) => {
      const values = {
        title: q.title,
        descriptionMd: q.descriptionMd,
        difficulty: q.difficulty,
        tags: q.tags ?? [],
        starterCode: q.starterCode ?? {},
        hints: q.hints ?? [],
        isPublic: true,
        ownerId: null,
      };
      const [row] = await tx
        .insert(questions)
        .values({ ...values, seedKey: q.seedKey })
        .onConflictDoUpdate({ target: questions.seedKey, set: values })
        .returning({ id: questions.id });
      if (!row) throw new Error(`Could not upsert ${q.seedKey}`);
      await tx.delete(testCases).where(eq(testCases.questionId, row.id));
      const tests = q.testCases ?? [];
      if (tests.length) {
        await tx.insert(testCases).values(
          tests.map((t, i) => ({
            questionId: row.id,
            stdin: t.stdin,
            expectedStdout: t.expectedStdout,
            isHidden: t.isHidden ?? false,
            weight: t.weight ?? 1,
            sortOrder: i,
          })),
        );
      }
    });
  }
  return built.length;
}
