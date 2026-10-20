import {
  outputsMatch,
  type Lang,
  type TestOutcome,
  type TestResult,
  type TestRun,
} from '@sidebyside/shared';

export interface StoredTest {
  id: string;
  stdin: string;
  expectedStdout: string;
  isHidden: boolean;
}

export interface TestRunContext {
  requestId: string;
  questionId: string;
  questionTitle: string;
  language: Lang;
  requestedBy: string;
  serverTs: number;
}

/**
 * Combines the tests stored on the server with the outcomes a browser reported. Pass/fail is
 * decided here from the stored expected output, not taken from the browser. Returns the full
 * results (for interviewers) and the candidate view, where hidden tests carry no inputs,
 * expected output, actual output or error text.
 */
export function buildTestRuns(
  tests: StoredTest[],
  outcomes: TestOutcome[],
  ctx: TestRunContext,
): { full: TestRun; candidate: TestRun } {
  const byId = new Map(outcomes.map((o) => [o.testId, o]));
  const full: TestResult[] = tests.map((t, index) => {
    const o = byId.get(t.id);
    const status = !o
      ? 'error'
      : o.status === 'error' || o.status === 'timeout'
        ? o.status
        : outputsMatch(o.actualStdout, t.expectedStdout)
          ? 'passed'
          : 'failed';
    return {
      index,
      status,
      timeMs: o?.timeMs ?? 0,
      hidden: t.isHidden,
      stdin: t.stdin,
      expectedStdout: t.expectedStdout,
      actualStdout: o?.actualStdout ?? '',
      stderr: o ? o.stderr : 'This test was not run.',
    };
  });
  const candidate: TestResult[] = full.map((r) =>
    r.hidden ? { index: r.index, status: r.status, timeMs: r.timeMs, hidden: true } : r,
  );
  const passed = full.filter((r) => r.status === 'passed').length;
  const base = { ...ctx, passed, total: full.length };
  return { full: { ...base, results: full }, candidate: { ...base, results: candidate } };
}
