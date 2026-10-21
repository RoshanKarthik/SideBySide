import { describe, expect, it } from 'vitest';
import { buildTestRuns, type StoredTest } from './test-results';

const tests: StoredTest[] = [
  { id: 'v1', stdin: '1 2', expectedStdout: '3', isHidden: false, weight: 1 },
  { id: 'h1', stdin: 'SECRET-INPUT', expectedStdout: 'SECRET-EXPECTED', isHidden: true, weight: 2 },
  { id: 'h2', stdin: 'SECRET-2', expectedStdout: '42', isHidden: true, weight: 1 },
];
const ctx = {
  requestId: 'r1',
  questionId: 'q1',
  questionTitle: 'Q',
  language: 'python' as const,
  requestedBy: 'Asha',
  serverTs: 1,
};

describe('buildTestRuns', () => {
  const { full, candidate } = buildTestRuns(
    tests,
    [
      { testId: 'v1', status: 'passed', timeMs: 3, actualStdout: '3\n', stderr: '' },
      // The browser claims "passed" but the output is wrong: the server decides.
      { testId: 'h1', status: 'passed', timeMs: 4, actualStdout: 'nope', stderr: 'SECRET-TRACE' },
    ],
    ctx,
  );

  it('decides pass/fail from the stored expected output', () => {
    expect(full.results.map((r) => r.status)).toEqual(['passed', 'failed', 'error']);
    expect(full.passed).toBe(1);
    expect(full.total).toBe(3);
  });

  it('scores by test weight', () => {
    // 1 of 4 weight points passed.
    expect(full.score).toBe(25);
    expect(candidate.score).toBe(25);
  });

  it('gives interviewers everything', () => {
    expect(full.results[1]).toMatchObject({
      stdin: 'SECRET-INPUT',
      expectedStdout: 'SECRET-EXPECTED',
    });
  });

  it('never puts hidden test contents in the candidate view', () => {
    const json = JSON.stringify(candidate);
    expect(json).not.toContain('SECRET');
    expect(candidate.results[1]).toEqual({ index: 1, status: 'failed', timeMs: 4, hidden: true });
    expect(candidate.results[0]).toMatchObject({ stdin: '1 2', expectedStdout: '3' });
    expect(candidate.passed).toBe(1);
  });
});
