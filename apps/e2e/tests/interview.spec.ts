import { expect, test } from '@playwright/test';
import {
  createRoom,
  guest,
  joinAsGuest,
  openRoomTab,
  presence,
  replaceCode,
  sharedCode,
  showQuestion,
  signUp,
} from './helpers';

const SOLUTION = `import sys


def solve(data: str) -> str:
    lines = data.split("\\n")
    nums = [int(x) for x in lines[1].split()]
    target = int(lines[2])
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return f"{seen[target - x]} {i}"
        seen.setdefault(x, i)
    return ""


print(solve(sys.stdin.read()))
`;

test('Flow A: an interviewer runs an interview with a guest candidate', async ({ browser }) => {
  const interviewer = await signUp(browser, 'Priya Interviewer');
  const candidate = await guest(browser, 'Asha Candidate');
  const title = `Frontend round – Asha ${Date.now().toString(36)}`;

  let slug = '';

  await test.step('interviewer creates a room', async () => {
    slug = await createRoom(interviewer.page, title);
  });

  await test.step('candidate joins from the link after the consent notice', async () => {
    const { page } = candidate;
    await joinAsGuest(candidate, slug, title);
    // Candidates never get the interviewer panel.
    await expect(page.getByRole('complementary', { name: 'Interviewer panel' })).toHaveCount(0);
  });

  await test.step('both see each other in the room', async () => {
    for (const { page } of [interviewer, candidate]) {
      await expect(presence(page).getByLabel(interviewer.name, { exact: false })).toBeVisible();
      await expect(presence(page).getByLabel(candidate.name, { exact: false })).toBeVisible();
    }
  });

  await test.step('Show to candidate loads the problem and starter code', async () => {
    await openRoomTab(interviewer.page, 'Code');
    await openRoomTab(candidate.page, 'Code');
    await showQuestion(interviewer.page, 'Two Sum');
    const problem = candidate.page.getByRole('region', { name: 'Problem' });
    await expect(problem.getByText('Two Sum')).toBeVisible();
    await expect(problem.getByText(/find the two different positions/)).toBeVisible();
    await expect.poll(() => sharedCode(candidate.page)).toContain('def solve(data: str) -> str:');
    await expect(candidate.page.getByLabel('Code editor')).toContainText('def solve');
  });

  await test.step('candidate writes a solution and runs it', async () => {
    const { page } = candidate;
    await replaceCode(page, SOLUTION);
    // The interviewer's copy of the code converges.
    await expect.poll(() => sharedCode(interviewer.page)).toBe(SOLUTION);

    await page.getByRole('button', { name: 'Input (stdin)' }).click();
    await page.getByLabel('Program input').fill('4\n2 7 11 15\n9');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    // The first run loads Python in the browser.
    const ranOk = new RegExp(`${candidate.name} ran Python 3 · ok`);
    await expect(page.getByText(ranOk)).toBeVisible({ timeout: 120_000 });
    // The problem statement's example output is the same; the output drawer comes after it.
    await expect(
      page
        .locator('pre')
        .filter({ hasText: /^0 1\s*$/ })
        .last(),
    ).toBeVisible();
    // Everyone in the room sees the run.
    await expect(interviewer.page.getByText(ranOk)).toBeVisible();
  });

  await test.step('Run tests reports a score; hidden tests show status only', async () => {
    const { page } = candidate;
    await page.getByRole('button', { name: 'Run tests' }).click();
    await expect(page.getByText('6 / 6 tests passed')).toBeVisible({ timeout: 120_000 });

    const hiddenRows = page.getByRole('listitem').filter({ hasText: /Test \d+hidden/ });
    await expect(hiddenRows).toHaveCount(3);
    await hiddenRows
      .first()
      .getByText(/^Test \d+/)
      .click();
    await expect(
      hiddenRows.first().getByText('Hidden test: its input and expected output are not shown.'),
    ).toBeVisible();

    // The candidate's copy of the results never carries a hidden test's input.
    const run = await page.evaluate(() => window.__sbsRoom?.lastTestRun ?? null);
    expect(run?.passed).toBe(6);
    expect(run?.total).toBe(6);
    const hidden = run?.results.filter((r) => r.hidden) ?? [];
    expect(hidden).toHaveLength(3);
    for (const r of hidden) expect(r.stdin).toBeUndefined();
    for (const r of run?.results.filter((x) => !x.hidden) ?? []) expect(r.stdin).toBeTruthy();
  });

  await test.step('interviewer keeps private notes and fills the rubric', async () => {
    const { page } = interviewer;
    const panel = page.getByRole('complementary', { name: 'Interviewer panel' });
    await panel.getByRole('tab', { name: 'Notes' }).click();
    await panel.getByRole('button', { name: 'Timestamp' }).click();
    await page.keyboard.type('Explained the hash map approach clearly');
    const notes = panel.getByLabel('Private interviewer notes');
    await expect(notes).toContainText(/\[\d\d:\d\d\] Explained the hash map approach clearly/);

    await panel.getByRole('tab', { name: 'Rubric' }).click();
    const approach = panel.getByRole('radiogroup', { name: 'Approach' });
    await approach.getByRole('radio', { name: '3' }).click();
    await expect(approach.getByRole('radio', { name: '3' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await panel.getByLabel('Approach comment').fill('Went straight to the one-pass solution');

    // None of it reaches the candidate.
    await expect(candidate.page.getByText('Explained the hash map approach')).toHaveCount(0);
    await expect(candidate.page.getByText('one-pass solution')).toHaveCount(0);
  });

  await test.step('interviewer ends the session for everyone', async () => {
    const { page } = interviewer;
    await page.getByRole('button', { name: 'End session' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'End session' }).click();
    for (const actor of [interviewer, candidate]) {
      await expect(actor.page.getByRole('heading', { name: 'Session ended' })).toBeVisible();
    }
  });

  await test.step('the replay opens', async () => {
    const { page } = interviewer;
    await page.getByRole('link', { name: 'Watch the replay' }).click();
    await page.waitForURL('**/rooms/*/replay');
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('tablist', { name: 'Replay' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    const moments = page.getByRole('complementary', { name: 'Key moments' });
    await expect(moments).toContainText('Question: Two Sum');
    await expect(moments).toContainText('Tests: 6 / 6 passed');
  });

  await interviewer.context.close();
  await candidate.context.close();
});
