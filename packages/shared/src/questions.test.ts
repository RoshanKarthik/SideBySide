import { describe, expect, it } from 'vitest';
import { weightedScore } from './questions';

describe('weightedScore', () => {
  it('is the share of test weight that passed, out of 100', () => {
    expect(
      weightedScore([
        { passed: true, weight: 1 },
        { passed: true, weight: 1 },
        { passed: true, weight: 3 },
        { passed: false, weight: 2 },
      ]),
    ).toBe(71);
  });

  it('gives 100 when everything passes and 0 for no tests', () => {
    expect(weightedScore([{ passed: true, weight: 5 }])).toBe(100);
    expect(weightedScore([])).toBe(0);
  });

  it('counts a weight below 1 as 1', () => {
    expect(
      weightedScore([
        { passed: true, weight: 0 },
        { passed: false, weight: 1 },
      ]),
    ).toBe(50);
  });
});
