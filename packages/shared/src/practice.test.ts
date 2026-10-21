import { describe, expect, it } from 'vitest';
import { PRACTICE_FALLBACK_MS, findPartner, type QueueEntry } from './practice';

const entry = (
  userId: string,
  over: Partial<QueueEntry['prefs']> = {},
  enqueuedAt = 0,
): QueueEntry => ({
  userId,
  name: userId,
  prefs: { topic: 'arrays', difficulty: 'easy', language: 'python', ...over },
  enqueuedAt,
  lastSeen: enqueuedAt,
});

describe('findPartner', () => {
  it('needs the same difficulty and language', () => {
    const me = entry('me');
    expect(findPartner(me, [me, entry('a', { difficulty: 'hard' })], 0)).toBeNull();
    expect(findPartner(me, [entry('b', { language: 'go' })], 0)).toBeNull();
    expect(findPartner(me, [entry('c')], 0)?.userId).toBe('c');
  });

  it('matches topics exactly at first, with "mixed" matching anything', () => {
    const me = entry('me', { topic: 'graphs' }, 1000);
    expect(findPartner(me, [entry('a', { topic: 'trees' }, 1000)], 1000)).toBeNull();
    expect(findPartner(me, [entry('b', { topic: 'mixed' }, 1000)], 1000)?.userId).toBe('b');
  });

  it('relaxes the topic once either side has waited past the fallback', () => {
    const me = entry('me', { topic: 'graphs' }, 0);
    const other = entry('a', { topic: 'trees' }, 0);
    expect(findPartner(me, [other], PRACTICE_FALLBACK_MS - 1)).toBeNull();
    expect(findPartner(me, [other], PRACTICE_FALLBACK_MS)?.userId).toBe('a');
  });

  it('prefers whoever has waited longest', () => {
    const me = entry('me', {}, 50);
    expect(findPartner(me, [entry('late', {}, 40), entry('early', {}, 10)], 60)?.userId).toBe(
      'early',
    );
  });
});
