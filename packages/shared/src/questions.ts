import { z } from 'zod';
import { LANGUAGES, langSchema, type Lang } from './languages';

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export const difficultySchema = z.enum(DIFFICULTIES);
export type Difficulty = z.infer<typeof difficultySchema>;

export const QUESTION_LIMITS = {
  title: 120,
  description: 20_000,
  tags: 10,
  tag: 30,
  hints: 10,
  hint: 1_000,
  starter: 16_000,
  testCases: 50,
  testIo: 64 * 1024,
} as const;

export const testCaseInputSchema = z.object({
  stdin: z.string().max(QUESTION_LIMITS.testIo),
  expectedStdout: z.string().max(QUESTION_LIMITS.testIo),
  isHidden: z.boolean().default(false),
  weight: z.number().int().min(1).max(100).default(1),
});
export type TestCaseInput = z.input<typeof testCaseInputSchema>;

export const starterCodeSchema = z
  .record(z.string(), z.string().max(QUESTION_LIMITS.starter))
  .refine(
    (v) => Object.keys(v).every((k) => (LANGUAGES as readonly string[]).includes(k)),
    'Unknown language',
  );
export type StarterCode = Partial<Record<Lang, string>>;

export const questionInputSchema = z.object({
  title: z.string().trim().min(1).max(QUESTION_LIMITS.title),
  descriptionMd: z.string().max(QUESTION_LIMITS.description),
  difficulty: difficultySchema,
  tags: z
    .array(z.string().trim().min(1).max(QUESTION_LIMITS.tag))
    .max(QUESTION_LIMITS.tags)
    .default([]),
  starterCode: starterCodeSchema.default({}),
  hints: z
    .array(z.string().trim().min(1).max(QUESTION_LIMITS.hint))
    .max(QUESTION_LIMITS.hints)
    .default([]),
  testCases: z.array(testCaseInputSchema).max(QUESTION_LIMITS.testCases).default([]),
});
export type QuestionInput = z.input<typeof questionInputSchema>;

export const testCaseSchema = z.object({
  id: z.string(),
  stdin: z.string(),
  expectedStdout: z.string(),
  isHidden: z.boolean(),
  weight: z.number().int(),
});
export type TestCase = z.infer<typeof testCaseSchema>;

export const questionSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  difficulty: difficultySchema,
  tags: z.array(z.string()),
  isPublic: z.boolean(),
  mine: z.boolean(),
  hintCount: z.number().int(),
  testCount: z.number().int(),
  hiddenTestCount: z.number().int(),
});
export type QuestionSummary = z.infer<typeof questionSummarySchema>;

/** A question as its owner (or an interviewer in a room using it) sees it. */
export const questionSchema = questionSummarySchema.extend({
  descriptionMd: z.string(),
  starterCode: z.record(z.string(), z.string()),
  hints: z.array(z.string()),
  /** Hidden tests are included only for callers allowed to see them. */
  testCases: z.array(testCaseSchema),
});
export type Question = z.infer<typeof questionSchema>;

// ---------------------------------------------------------------------------
// Test runs
// ---------------------------------------------------------------------------

export const TEST_STATUSES = ['passed', 'failed', 'error', 'timeout'] as const;
export const testStatusSchema = z.enum(TEST_STATUSES);
export type TestStatus = z.infer<typeof testStatusSchema>;

/** What the browser that ran the tests reports for one test. */
export const testOutcomeSchema = z.object({
  testId: z.string(),
  status: testStatusSchema,
  timeMs: z.number().int().nonnegative(),
  actualStdout: z.string().max(QUESTION_LIMITS.testIo + 200),
  stderr: z.string().max(QUESTION_LIMITS.testIo + 200),
});
export type TestOutcome = z.infer<typeof testOutcomeSchema>;

/** One test's result as shown to a participant; hidden tests carry no contents for candidates. */
export const testResultSchema = z.object({
  index: z.number().int(),
  status: testStatusSchema,
  timeMs: z.number().int(),
  hidden: z.boolean(),
  stdin: z.string().optional(),
  expectedStdout: z.string().optional(),
  actualStdout: z.string().optional(),
  stderr: z.string().optional(),
});
export type TestResult = z.infer<typeof testResultSchema>;

export const testRunSchema = z.object({
  requestId: z.string(),
  questionId: z.string(),
  questionTitle: z.string(),
  language: langSchema,
  passed: z.number().int(),
  total: z.number().int(),
  /** 0–100, weighted by each test's weight. */
  score: z.number().int().min(0).max(100),
  results: z.array(testResultSchema),
  requestedBy: z.string(),
  serverTs: z.number(),
});
export type TestRun = z.infer<typeof testRunSchema>;

/** A test run's score out of 100: the share of test weight that passed, rounded down. */
export function weightedScore(tests: { passed: boolean; weight: number }[]): number {
  const total = tests.reduce((sum, t) => sum + Math.max(1, t.weight), 0);
  if (!total) return 0;
  const passed = tests.reduce((sum, t) => sum + (t.passed ? Math.max(1, t.weight) : 0), 0);
  return Math.floor((passed / total) * 100);
}

/**
 * Output comparison: trailing whitespace on each line and trailing blank lines are ignored;
 * everything else must match exactly.
 */
export function outputsMatch(actual: string, expected: string): boolean {
  const normalise = (s: string) =>
    s
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.replace(/\s+$/, ''))
      .join('\n')
      .replace(/\n+$/, '');
  return normalise(actual) === normalise(expected);
}

// ---------------------------------------------------------------------------
// Rubric
// ---------------------------------------------------------------------------

export const DEFAULT_RUBRIC = [
  'Problem understanding',
  'Approach',
  'Code quality',
  'Correctness & testing',
  'Complexity analysis',
  'Communication',
] as const;

export const RUBRIC_SCORE_LABELS: Record<number, string> = {
  1: 'Weak',
  2: 'Mixed',
  3: 'Good',
  4: 'Strong',
};
