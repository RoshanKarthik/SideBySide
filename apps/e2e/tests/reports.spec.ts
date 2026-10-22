import { expect, test } from '@playwright/test';
import { createRoom, guest, joinAsGuest, signUp } from './helpers';

/**
 * AI reports after a session. Runs when the server writes reports (AI_SUMMARY_PROVIDER set, e.g.
 * `sample` in apps/server/.dev.vars); otherwise it is skipped.
 */
test('AI reports: the interviewer gets both, the candidate their shared feedback', async ({
  browser,
}) => {
  const interviewer = await signUp(browser, 'Priya Reporter');
  const candidate = await guest(browser, 'Asha Reported');
  const title = `Report check ${Date.now().toString(36)}`;

  const slug = await createRoom(interviewer.page, title, { shareReport: true });
  await joinAsGuest(candidate, slug, title);

  const roomId = await interviewer.page.evaluate(async (s) => {
    const res = await fetch(`/api/rooms/${s}/me`);
    return ((await res.json()) as { room: { id: string } }).room.id;
  }, slug);
  const enabled = await interviewer.page.evaluate(async (id) => {
    const res = await fetch(`/api/rooms/${id}/reports`);
    return ((await res.json()) as { enabled: boolean }).enabled;
  }, roomId);
  test.skip(!enabled, 'AI reports are switched off on this server');

  await test.step('ending the session starts the reports', async () => {
    const { page } = interviewer;
    await page.getByRole('button', { name: 'End session' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'End session' }).click();
    await page.getByRole('link', { name: 'Open the session summary' }).click();
    await page.waitForURL('**/sessions/*');
  });

  await test.step('the interviewer reads the report for the hiring team', async () => {
    const { page } = interviewer;
    await expect(page.getByRole('heading', { name: 'AI report' })).toBeVisible();
    await expect(page.getByText('Suggested rubric scores')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/not a hiring decision/)).toBeVisible();
    await page.getByRole('tab', { name: 'Candidate feedback' }).click();
    await expect(page.getByText('What went well')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Regenerate' })).toBeEnabled();
  });

  await test.step('the candidate reads only their own feedback', async () => {
    const { page } = candidate;
    await expect(page.getByRole('heading', { name: 'Session ended' })).toBeVisible();
    await page.getByRole('link', { name: 'Read your feedback' }).click({ timeout: 60_000 });
    await page.waitForURL('**/feedback');
    await expect(page.getByText('What went well')).toBeVisible();
    await expect(page.getByText('Suggested rubric scores')).toHaveCount(0);
  });

  await interviewer.context.close();
  await candidate.context.close();
});
