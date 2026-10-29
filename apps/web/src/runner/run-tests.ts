import { outputsMatch, type Lang, type Question, type TestOutcome } from '@sidebyside/shared';
import { api } from '@/lib/api';
import { CodeRunner } from './runner';
import { serverRunner } from './server-run';

/**
 * Runs a question's tests (hidden ones included) against some code, in this browser. Only an
 * interviewer can fetch the tests. A fresh sandboxed worker is used for every batch, so code
 * from an earlier run can't interfere with this one.
 */
export async function runTestsInBrowser(
  roomId: string,
  slug: string,
  questionId: string,
  language: Lang,
  source: string,
): Promise<TestOutcome[]> {
  const question = await api.json<Question>(`/rooms/${roomId}/questions/${questionId}`, {
    roomKey: slug,
  });
  const runner = new CodeRunner(serverRunner(roomId, slug));
  const outcomes: TestOutcome[] = [];
  try {
    for (const test of question.testCases) {
      const out = await runner.run(language, source, test.stdin);
      const status =
        out.status === 'timeout'
          ? 'timeout'
          : out.status !== 'ok'
            ? 'error'
            : outputsMatch(out.stdout, test.expectedStdout)
              ? 'passed'
              : 'failed';
      outcomes.push({
        testId: test.id,
        status,
        timeMs: out.timeMs,
        actualStdout: out.stdout,
        stderr: out.stderr,
      });
    }
  } finally {
    runner.dispose();
  }
  return outcomes;
}
