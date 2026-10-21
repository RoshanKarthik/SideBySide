import { expect, test } from '@playwright/test';
import {
  appendLine,
  codeEditor,
  connectionStatus,
  createRoom,
  guest,
  joinAsGuest,
  openRoomTab,
  prependLine,
  sharedCode,
  showQuestion,
  signUp,
} from './helpers';

/** How long the candidate stays offline, as in the acceptance flow. */
const OFFLINE_MS = 40_000;
const OFFLINE_LINES = [
  '# offline edit 1',
  '# offline edit 2',
  '# offline edit 3',
  '# offline edit 4',
];
const INTERVIEWER_LINE = '# interviewer: consider an empty array';

test('Flow C: a candidate keeps typing offline and their edits merge on reconnect', async ({
  browser,
}) => {
  test.setTimeout(OFFLINE_MS + 180_000);
  const interviewer = await signUp(browser, 'Priya Interviewer');
  const candidate = await guest(browser, 'Asha Candidate');
  const title = `Reconnect check ${Date.now().toString(36)}`;

  await test.step('both are in the room with the starter code loaded', async () => {
    const slug = await createRoom(interviewer.page, title);
    await joinAsGuest(candidate, slug, title);
    await openRoomTab(interviewer.page, 'Code');
    await openRoomTab(candidate.page, 'Code');
    await showQuestion(interviewer.page, 'Two Sum');
    await expect.poll(() => sharedCode(candidate.page)).toContain('def solve');
    await expect(candidate.page.getByLabel('Code editor')).toContainText('def solve');
  });

  await test.step('the candidate drops offline and keeps typing', async () => {
    const { page, context } = candidate;
    await context.setOffline(true);
    await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toHaveText(
      'Offline — edits will sync when you’re back',
    );
    expect(await connectionStatus(page)).toBe('offline');

    // Type a line every few seconds for the whole time offline; the interviewer edits too.
    const started = Date.now();
    for (const [i, line] of OFFLINE_LINES.entries()) {
      await appendLine(page, line);
      if (i === 1) await prependLine(interviewer.page, INTERVIEWER_LINE);
      const next = ((i + 1) * OFFLINE_MS) / OFFLINE_LINES.length;
      await page.waitForTimeout(Math.max(0, started + next - Date.now()));
    }

    // The candidate's copy has everything they typed; the interviewer has seen none of it.
    const local = await sharedCode(page);
    for (const line of OFFLINE_LINES) expect(local).toContain(line);
    expect(local).not.toContain(INTERVIEWER_LINE);
    const remote = await sharedCode(interviewer.page);
    expect(remote).toContain(INTERVIEWER_LINE);
    for (const line of OFFLINE_LINES) expect(remote).not.toContain(line);
  });

  await test.step('on reconnect both edits merge without loss', async () => {
    const { page, context } = candidate;
    await context.setOffline(false);
    await expect.poll(() => connectionStatus(page), { timeout: 30_000 }).toBe('connected');

    await expect
      .poll(() => sharedCode(interviewer.page), { timeout: 30_000 })
      .toContain(OFFLINE_LINES.at(-1)!);
    const merged = await sharedCode(interviewer.page);
    expect(await sharedCode(page)).toBe(merged);
    expect(merged.startsWith(`${INTERVIEWER_LINE}\n`)).toBe(true);
    expect(merged.trimEnd().endsWith(OFFLINE_LINES.join('\n'))).toBe(true);
    expect(merged).toContain('def solve');

    // And the editors show it (scrolled to each other's edit; the editor only renders what's in view).
    await codeEditor(interviewer.page).click();
    await interviewer.page.keyboard.press('ControlOrMeta+End');
    await expect(codeEditor(interviewer.page)).toContainText(OFFLINE_LINES.at(-1)!);
    await codeEditor(page).click();
    await page.keyboard.press('ControlOrMeta+Home');
    await expect(codeEditor(page)).toContainText(INTERVIEWER_LINE);
  });

  await interviewer.context.close();
  await candidate.context.close();
});
