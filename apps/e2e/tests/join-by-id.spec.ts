import { expect, test } from '@playwright/test';
import { createRoom, guest, signUp, waitForRoom } from './helpers';

test('A candidate who was told the room ID joins with it', async ({ browser }) => {
  const interviewer = await signUp(browser, 'Priya Host');
  const candidate = await guest(browser, 'Asha Typing');
  const title = `Room ID round ${Date.now().toString(36)}`;

  const slug = await createRoom(interviewer.page, title);
  expect(slug).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);

  await test.step('the candidate types the ID as they heard it', async () => {
    const { page } = candidate;
    await page.goto('/');
    await page.getByRole('link', { name: 'Join a room' }).click();
    await page.getByLabel('Room ID').fill('abcd efgh jkmn');
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('No room has this ID');

    await page.getByLabel('Room ID').fill(slug.replaceAll('-', ' ').toUpperCase());
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await page.waitForURL(`**/r/${slug}`);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  });

  await test.step('and joins the room like anyone with the link', async () => {
    const { page } = candidate;
    await page.getByLabel('Your name').fill(candidate.name);
    await page.getByText('I understand and agree').click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await waitForRoom(page);
  });

  await interviewer.context.close();
  await candidate.context.close();
});
