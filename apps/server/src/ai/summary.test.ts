import type { DbHandle } from '@sidebyside/db';
import { createTestDb } from '@sidebyside/db/testing';
import { eq, rooms, sessionReports, users } from '@sidebyside/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SummaryProvider } from './provider';
import { buildBriefs, runReportJob, writeReport } from './summary';

const CANDIDATE = {
  wentWell: ['You explained your idea first.'],
  toImprove: ['Test empty input.'],
  conceptsToStudy: ['Hash maps'],
  referenceApproach: 'Use a hash map from value to index.',
  complexityNotes: 'O(n) time and space.',
};

function provider(answers: unknown[]): SummaryProvider & { calls: number } {
  const p = {
    name: 'fake',
    calls: 0,
    complete: vi.fn(async () => {
      const answer = answers[Math.min(p.calls, answers.length - 1)];
      p.calls++;
      if (answer instanceof Error) throw answer;
      return { answer, model: 'fake' };
    }),
  };
  return p;
}

let handle: DbHandle;
let roomId: string;

beforeAll(async () => {
  handle = await createTestDb();
  const [user] = await handle.db
    .insert(users)
    .values({ email: 'summary@example.test', name: 'Priya' })
    .returning();
  const [room] = await handle.db
    .insert(rooms)
    .values({ slug: 'summary001', ownerId: user!.id, title: 'Backend round', status: 'ended' })
    .returning();
  roomId = room!.id;
});
afterAll(async () => {
  await handle.close();
});

describe('writeReport', () => {
  it('accepts JSON returned as text', async () => {
    const p = provider([`Here you go: ${JSON.stringify(CANDIDATE)}`]);
    expect(await writeReport(p, 'candidate', 'brief')).toEqual({
      content: CANDIDATE,
      model: 'fake',
    });
  });

  it('retries once after an invalid answer', async () => {
    const p = provider([{ wentWell: 'not a list' }, CANDIDATE]);
    expect((await writeReport(p, 'candidate', 'brief')).content).toEqual(CANDIDATE);
    expect(p.calls).toBe(2);
  });

  it('gives up after two invalid answers', async () => {
    const p = provider(['nonsense']);
    await expect(writeReport(p, 'candidate', 'brief')).rejects.toThrow(/report format/);
    expect(p.calls).toBe(2);
  });
});

describe('buildBriefs', () => {
  it('keeps private notes and the rubric out of the candidate brief', async () => {
    const briefs = await buildBriefs(handle.db, roomId, 1, {
      sharedNotes: 'SHARED-NOTE',
      privateNotes: 'PRIVATE-NOTE',
      code: { python: 'def solve(): pass' },
    });
    expect(briefs.interviewer).toContain('PRIVATE-NOTE');
    expect(briefs.interviewer).toContain('SHARED-NOTE');
    expect(briefs.candidate).not.toContain('PRIVATE-NOTE');
    expect(briefs.candidate).not.toContain('rubric');
    expect(briefs.candidate).toContain('def solve()');
  });
});

describe('runReportJob', () => {
  it('stores a failed report with the reason when the provider fails', async () => {
    await runReportJob({
      db: handle.db,
      provider: provider([new Error('Workers AI request failed: quota')]),
      roomId,
      round: 1,
      docs: { sharedNotes: '', privateNotes: '', code: {} },
    });
    const rows = await handle.db
      .select()
      .from(sessionReports)
      .where(eq(sessionReports.roomId, roomId));
    expect(rows.map((r) => r.status).sort()).toEqual(['failed', 'failed']);
    expect(rows[0]!.error).toContain('quota');
  });
});
