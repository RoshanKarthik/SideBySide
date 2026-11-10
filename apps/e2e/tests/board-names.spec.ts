import { expect, test } from '@playwright/test';
import { createRoom, guest, joinAsGuest, openRoomTab, signUp } from './helpers';

test('The whiteboard shows who is typing where', async ({ browser }) => {
  const interviewer = await signUp(browser, 'Priya Board');
  const candidate = await guest(browser, 'Asha Sketch');
  const title = `Board names ${Date.now().toString(36)}`;

  const slug = await createRoom(interviewer.page, title);
  await joinAsGuest(candidate, slug, title);
  await openRoomTab(interviewer.page, 'Design');
  await openRoomTab(candidate.page, 'Design');

  await test.step('the candidate starts typing on the board', async () => {
    const canvas = candidate.page.locator('.excalidraw canvas.interactive');
    await expect(canvas).toBeVisible();
    await canvas.dblclick({ position: { x: 200, y: 260 } });
    await candidate.page.keyboard.type('Two pointers');
  });

  // The name tags drawn over the interviewer's board.
  const tags = interviewer.page.locator('div:has(> .excalidraw)');

  await test.step('the interviewer sees their name on it', async () => {
    await expect(tags.getByText(`${candidate.name} · typing`)).toBeVisible();
  });

  await test.step('and just their name once they finish, while it stays selected', async () => {
    await candidate.page.keyboard.press('Escape');
    await expect(tags.getByText(candidate.name, { exact: true })).toBeVisible();
  });

  await interviewer.context.close();
  await candidate.context.close();
});
