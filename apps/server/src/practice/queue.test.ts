import { describe, expect, it } from 'vitest';
import { MatchQueue, type MatchResult } from './queue';

const prefs = { topic: 'arrays', difficulty: 'medium', language: 'python' } as const;

describe('MatchQueue', () => {
  it('keeps reporting "waiting" while the matched room is being created', async () => {
    let finish: (r: MatchResult) => void = () => {};
    const queue = new MatchQueue(() => new Promise<MatchResult>((resolve) => (finish = resolve)));

    await queue.enqueue({ id: 'ravi', name: 'Ravi' }, prefs, 1000);
    const second = queue.enqueue({ id: 'meera', name: 'Meera' }, prefs, 2000);

    // Ravi polls before the room exists: still waiting, so the page keeps polling.
    expect(queue.status('ravi', 2500).status).toBe('waiting');

    finish({ roomSlug: 'room1' });
    expect(await second).toMatchObject({ status: 'matched', roomSlug: 'room1' });
    expect(queue.status('ravi', 3000)).toEqual({
      status: 'matched',
      roomSlug: 'room1',
      partnerName: 'Meera',
    });
  });

  it('keeps a background tab that checks in once a minute, and drops one that went quiet', async () => {
    const queue = new MatchQueue(async () => ({ roomSlug: 'unused' }));
    await queue.enqueue({ id: 'ravi', name: 'Ravi' }, prefs, 0);
    await queue.enqueue({ id: 'meera', name: 'Meera' }, { ...prefs, language: 'java' }, 0);

    // The matchmaker sweeps every 5 seconds. Ravi's tab is in the background and polls once a
    // minute; Meera's page was closed.
    for (let now = 5_000; now <= 180_000; now += 5_000) {
      if (now % 60_000 === 0) queue.status('ravi', now);
      await queue.sweep(now);
    }
    expect(queue.status('ravi', 181_000).status).toBe('waiting');
    expect(queue.status('meera', 181_000).status).toBe('idle');
  });

  it('puts both back in the queue when the room cannot be created', async () => {
    let fail: (e: Error) => void = () => {};
    const queue = new MatchQueue(() => new Promise<MatchResult>((_, reject) => (fail = reject)));

    await queue.enqueue({ id: 'ravi', name: 'Ravi' }, prefs, 1000);
    const second = queue.enqueue({ id: 'meera', name: 'Meera' }, prefs, 2000);
    fail(new Error('database down'));

    expect((await second).status).toBe('waiting');
    expect(queue.status('ravi', 3000).status).toBe('waiting');
    expect(queue.waitingCount).toBe(2);
  });
});
