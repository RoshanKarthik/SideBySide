import { expect, test } from '@playwright/test';
import { createRoom, guest, joinAsGuest, signUp, waitForRoom } from './helpers';

test('A candidate who leaves has to join again', async ({ browser }) => {
  const interviewer = await signUp(browser, 'Priya Rejoin');
  const candidate = await guest(browser, 'Asha Away');
  const title = `Rejoin ${Date.now().toString(36)}`;

  const slug = await createRoom(interviewer.page, title);
  await joinAsGuest(candidate, slug, title);
  // The candidate's seat in the room, which rejoining must keep.
  const seat = (page = candidate.page) =>
    page.evaluate(async (s) => {
      const token = localStorage.getItem(`sbs-guest:${s}`);
      const res = await fetch(`/api/rooms/${s}/me`, {
        headers: { authorization: `Bearer ${token}` },
      });
      return ((await res.json()) as { participant: { id: string } }).participant.id;
    }, slug);
  const firstSeat = await seat();

  const rejoin = async (page = candidate.page) => {
    const name = page.getByLabel('Your name');
    await expect(name).toHaveValue(candidate.name);
    await expect(name).not.toBeEditable();
    const join = page.getByRole('button', { name: 'Continue' });
    await expect(join).toBeDisabled();
    await page.getByText('I understand and agree').click();
    await join.click();
    await waitForRoom(page);
  };

  await test.step('Leave room goes back to the join screen', async () => {
    await candidate.page.getByRole('button', { name: 'Leave room' }).click();
    await expect(candidate.page.getByRole('status')).toContainText('You left the room');
    await rejoin();
    expect(await seat()).toBe(firstSeat);
  });

  await test.step('a reload keeps them in', async () => {
    await candidate.page.reload();
    await waitForRoom(candidate.page);
    await expect(candidate.page.getByRole('button', { name: 'Leave room' })).toBeVisible();
  });

  await test.step('opening the link again means joining again, into the same seat', async () => {
    await candidate.page.close();
    const page = await candidate.context.newPage();
    await page.goto(`/r/${slug}`);
    await rejoin(page);
    expect(await seat(page)).toBe(firstSeat);
  });

  await interviewer.context.close();
  await candidate.context.close();
});
