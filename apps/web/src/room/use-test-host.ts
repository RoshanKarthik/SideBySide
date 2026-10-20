import type { Room } from '@sidebyside/shared';
import { getCodeMap } from '@sidebyside/shared/doc';
import { useEffect, useState } from 'react';
import { runTestsInBrowser } from '@/runner/run-tests';
import type { RoomConnection } from './use-room';

/**
 * Interviewers' browsers run the tests when anyone in the room asks (only they may load the
 * hidden tests). Returns the name of whoever's tests are running right now, if any.
 */
export function useTestHost(
  conn: RoomConnection | null,
  room: Room,
  slug: string,
  enabled: boolean,
): string | null {
  const [runningFor, setRunningFor] = useState<string | null>(null);
  const provider = conn?.provider;

  useEffect(() => {
    if (!conn || !enabled) return;
    conn.onTestsRequested(async (req) => {
      const source = getCodeMap(conn.doc).get(req.language)?.toString() ?? '';
      setRunningFor(req.requestedByName);
      let outcomes: Awaited<ReturnType<typeof runTestsInBrowser>> = [];
      try {
        outcomes = await runTestsInBrowser(room.id, slug, req.questionId, req.language, source);
      } catch (err) {
        console.error('Running tests failed', err);
        // An empty result makes the room report every test as not run.
      } finally {
        setRunningFor(null);
      }
      conn.send({ kind: 'tests_result', requestId: req.requestId, source, outcomes });
    });
    return () => conn.onTestsRequested(null);
    // Re-register only when the connection itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, enabled, room.id, slug]);

  return runningFor;
}
