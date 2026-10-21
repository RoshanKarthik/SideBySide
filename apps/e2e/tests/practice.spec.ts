import { expect, test, type Page } from '@playwright/test';
import { showQuestion, signUp, slugFromUrl, waitForRoom, type Actor } from './helpers';

async function joinQueue(page: Page) {
  await page.goto('/practice');
  await page
    .getByRole('radiogroup', { name: 'Topic' })
    .getByRole('radio', { name: 'Arrays' })
    .click();
  await page
    .getByRole('radiogroup', { name: 'Difficulty' })
    .getByRole('radio', { name: 'Medium' })
    .click();
  await page.getByLabel('Language').selectOption('python');
  await page.getByRole('button', { name: 'Find a partner' }).click();
}

function banner(page: Page) {
  return page.getByText(/Round \d of 2/).locator('..');
}

function panel(page: Page) {
  return page.getByRole('complementary', { name: 'Interviewer panel' });
}

async function rate(actor: Actor) {
  const { page } = actor;
  await expect(page.getByRole('heading', { name: 'Rate your partner' })).toBeVisible();
  for (const criterion of ['Problem solving', 'Communication', 'As an interviewer']) {
    await page
      .getByRole('radiogroup', { name: criterion })
      .getByRole('radio', { name: '4 of 5' })
      .click();
  }
  await page.getByLabel('Comment for your partner').fill('Clear thinking out loud.');
  await page.getByRole('button', { name: 'Submit rating' }).click();
  await expect(page.getByText('You rated your partner. Thanks!')).toBeVisible();
}

test('Flow B: two peers practise, swap roles and rate each other', async ({ browser }) => {
  // Fresh accounts, so the queue can only pair these two with each other.
  const ravi = await signUp(browser, 'Ravi Peer');
  const meera = await signUp(browser, 'Meera Peer');

  await test.step('both join the queue with the same preferences and get matched', async () => {
    await joinQueue(ravi.page);
    await expect(ravi.page.getByRole('heading', { name: 'Looking for a partner…' })).toBeVisible();
    await expect(ravi.page.getByText('Arrays · Medium · Python 3')).toBeVisible();
    await joinQueue(meera.page);

    // Meera hears back at once, Ravi on the next queue poll. Each sees the card briefly before
    // the room opens, so watch both at the same time.
    await Promise.all([
      expect(
        meera.page.getByRole('heading', { name: `You’re matched with ${ravi.name}!` }),
      ).toBeVisible(),
      expect(
        ravi.page.getByRole('heading', { name: `You’re matched with ${meera.name}!` }),
      ).toBeVisible(),
    ]);
    for (const { page } of [ravi, meera]) {
      await page.waitForURL('**/r/*');
      await waitForRoom(page);
    }
    expect(slugFromUrl(meera.page)).toBe(slugFromUrl(ravi.page));
  });

  await test.step('round 1: the banner shows who interviews and who solves', async () => {
    // Whoever waited longer interviews first.
    await expect(banner(ravi.page)).toContainText('Round 1 of 2');
    await expect(banner(ravi.page)).toContainText(`You interview, ${meera.name} solves`);
    await expect(banner(meera.page)).toContainText('Round 1 of 2');
    await expect(banner(meera.page)).toContainText(`${ravi.name} interviews, you solve`);
    await expect(panel(ravi.page)).toBeVisible();
    await expect(panel(meera.page)).toHaveCount(0);
  });

  await test.step('the interviewer picks a question for the solver', async () => {
    await showQuestion(ravi.page, 'Two Sum');
    await meera.page
      .getByRole('tablist', { name: 'Room' })
      .getByRole('tab', { name: 'Code' })
      .click();
    await expect(
      meera.page.getByRole('region', { name: 'Problem' }).getByText('Two Sum'),
    ).toBeVisible();
  });

  await test.step('Swap roles moves both peers to round 2 with roles flipped', async () => {
    await ravi.page.getByRole('button', { name: 'Swap roles' }).click();
    for (const { page } of [ravi, meera]) {
      await expect(banner(page)).toContainText('Round 2 of 2');
      await waitForRoom(page);
    }
    await expect(banner(meera.page)).toContainText(`You interview, ${ravi.name} solves`);
    await expect(banner(ravi.page)).toContainText(`${meera.name} interviews, you solve`);
    await expect(panel(meera.page)).toBeVisible();
    await expect(panel(ravi.page)).toHaveCount(0);
    // There is no third round to swap to.
    await expect(ravi.page.getByRole('button', { name: 'Swap roles' })).toHaveCount(0);
  });

  await test.step('the round-2 interviewer ends the session', async () => {
    await meera.page.getByRole('button', { name: 'End session' }).click();
    await meera.page.getByRole('dialog').getByRole('button', { name: 'End session' }).click();
    for (const { page } of [ravi, meera]) {
      await expect(page.getByRole('heading', { name: 'Session ended' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Watch the replay' })).toBeVisible();
    }
  });

  await test.step('both rate each other', async () => {
    await rate(ravi);
    await rate(meera);
  });

  await ravi.context.close();
  await meera.context.close();
});
