import { expect, test, type Page } from '@playwright/test';
import { createRoom, guest, joinAsGuest, signUp } from './helpers';

function callPanel(page: Page) {
  return page.getByRole('region', { name: 'Video call' });
}

/** Whether the other person's tile is playing live video (frames with a size). */
function remoteVideoPlaying(page: Page) {
  return page.evaluate(() => {
    const videos = [
      ...document.querySelectorAll<HTMLVideoElement>('[aria-label="Video call"] video'),
    ].filter((v) => !v.muted);
    return videos.some((v) => v.videoWidth > 0 && !v.paused && v.readyState >= 2);
  });
}

test('Video call: interviewer and candidate see and hear each other', async ({ browser }) => {
  const interviewer = await signUp(browser, 'Priya Caller');
  const candidate = await guest(browser, 'Asha Caller');
  const title = `Call check ${Date.now().toString(36)}`;

  await test.step('both pass the lobby with camera and microphone on', async () => {
    const slug = await createRoom(interviewer.page, title);
    await joinAsGuest(candidate, slug, title);
    for (const { page } of [interviewer, candidate]) {
      await expect(callPanel(page)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Turn camera off' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Mute microphone' })).toBeVisible();
    }
  });

  await test.step('each receives the other’s live video', async () => {
    await expect(callPanel(interviewer.page)).toContainText('Call · 2 people');
    await expect(callPanel(candidate.page)).toContainText('Call · 2 people');
    await expect.poll(() => remoteVideoPlaying(interviewer.page), { timeout: 30_000 }).toBe(true);
    await expect.poll(() => remoteVideoPlaying(candidate.page), { timeout: 30_000 }).toBe(true);
  });

  await test.step('muting shows on the other side', async () => {
    await candidate.page.getByRole('button', { name: 'Mute microphone' }).click();
    await expect(candidate.page.getByRole('button', { name: 'Unmute microphone' })).toBeVisible();
    // The interviewer sees the candidate's tile with the muted icon (a red microphone).
    await expect
      .poll(() =>
        interviewer.page.evaluate(
          () => document.querySelectorAll('[aria-label="Video call"] .text-red-300').length,
        ),
      )
      .toBe(1);
  });

  await test.step('leaving the call keeps the room open', async () => {
    await candidate.page.getByRole('button', { name: 'Leave' }).click();
    await expect(callPanel(candidate.page)).toHaveCount(0);
    await expect(candidate.page.getByRole('button', { name: 'Join call' })).toBeVisible();
    await expect(callPanel(interviewer.page)).toContainText('Call · 1 person');
    await expect(callPanel(interviewer.page)).toContainText('Not in the call: Asha Caller');
  });

  await interviewer.context.close();
  await candidate.context.close();
});
