import {
  asc,
  eq,
  inArray,
  questions,
  testCases,
  type Database,
  type QuestionRow,
  type TestCaseRow,
} from '@sidebyside/db';
import type { Question, QuestionSummary } from '@sidebyside/shared';

/** Owners may use their own questions; anyone signed in may use the public bank. */
export function canUseQuestion(
  q: Pick<QuestionRow, 'ownerId' | 'isPublic'>,
  userId: string,
): boolean {
  return q.isPublic || q.ownerId === userId;
}

export function canEditQuestion(q: Pick<QuestionRow, 'ownerId'>, userId: string): boolean {
  return q.ownerId === userId;
}

export async function findQuestion(db: Database, id: string): Promise<QuestionRow | null> {
  const [row] = await db.select().from(questions).where(eq(questions.id, id));
  return row ?? null;
}

export async function loadTests(db: Database, questionIds: string[]): Promise<TestCaseRow[]> {
  if (!questionIds.length) return [];
  return db
    .select()
    .from(testCases)
    .where(inArray(testCases.questionId, questionIds))
    .orderBy(asc(testCases.questionId), asc(testCases.sortOrder));
}

export function toSummary(q: QuestionRow, tests: TestCaseRow[], userId: string): QuestionSummary {
  const mine = tests.filter((t) => t.questionId === q.id);
  return {
    id: q.id,
    title: q.title,
    difficulty: q.difficulty,
    tags: q.tags,
    isPublic: q.isPublic,
    mine: q.ownerId === userId,
    hintCount: q.hints.length,
    testCount: mine.length,
    hiddenTestCount: mine.filter((t) => t.isHidden).length,
  };
}

/**
 * The full question. Hidden test contents are included only when `includeHidden` is true;
 * otherwise only visible tests are listed (the summary still counts the hidden ones).
 */
export function toQuestion(
  q: QuestionRow,
  tests: TestCaseRow[],
  userId: string,
  includeHidden: boolean,
): Question {
  const own = tests.filter((t) => t.questionId === q.id);
  return {
    ...toSummary(q, own, userId),
    descriptionMd: q.descriptionMd,
    starterCode: q.starterCode,
    hints: q.hints,
    testCases: own
      .filter((t) => includeHidden || !t.isHidden)
      .map((t) => ({
        id: t.id,
        stdin: t.stdin,
        expectedStdout: t.expectedStdout,
        isHidden: t.isHidden,
        weight: t.weight,
      })),
  };
}
