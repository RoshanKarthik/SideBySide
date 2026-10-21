import { describe, expect, it } from 'vitest';
import { buildMarkers, type MarkerEvent } from './markers';

const ev = (
  type: string,
  payload: Record<string, unknown>,
  serverTs: number,
  participantId = 'p1',
): MarkerEvent => ({
  type,
  payload,
  serverTs,
  participantId,
});

describe('replay markers', () => {
  const events = [
    ev('question_shown', { title: 'Two Sum' }, 1),
    ev('code_run', { language: 'python', status: 'error' }, 2),
    ev('tests_run', { passed: 5, total: 6 }, 3),
    ev('tab_hidden', {}, 4),
    ev('tab_visible', { hiddenMs: 34_000 }, 5),
    ev('paste', { chars: 140 }, 6),
    ev('note_timestamp', { text: 'Strong start' }, 7, 'p2'),
  ];

  it('labels signals in plain language, with durations', () => {
    const markers = buildMarkers(events, { p1: 'Asha', p2: 'Priya' }, true);
    expect(markers.map((m) => [m.kind, m.tone, m.label])).toEqual([
      ['question_shown', 'info', 'Question: Two Sum'],
      ['code_run', 'error', 'Asha ran python (error)'],
      ['tests_run', 'error', 'Tests: 5 / 6 passed'],
      ['tab_hidden', 'signal', "Asha's tab was hidden for 34s"],
      ['paste', 'signal', 'Asha pasted 140 characters'],
      ['note_timestamp', 'info', 'Note: Strong start'],
    ]);
  });

  it('leaves out private note markers for people who may not see them', () => {
    const markers = buildMarkers(events, { p1: 'Asha' }, false);
    expect(markers.some((m) => m.kind === 'note_timestamp')).toBe(false);
  });
});
