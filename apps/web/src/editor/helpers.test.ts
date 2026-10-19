import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { formatClock, initials } from '@/lib/utils';
import { remoteCursorCss } from './remote-cursors';
import { applyTextDiff } from './text-binding';

describe('applyTextDiff', () => {
  it('turns a text change into a minimal edit that keeps concurrent edits', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    a.getText('t').insert(0, 'hello world');
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    // A edits the end, B (concurrently) edits the start.
    applyTextDiff(a.getText('t'), 'hello world!');
    applyTextDiff(b.getText('t'), 'Hello world');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    expect(a.getText('t').toString()).toBe('Hello world!');
    expect(b.getText('t').toString()).toBe('Hello world!');
  });

  it('handles deletions and no-ops', () => {
    const doc = new Y.Doc();
    const t = doc.getText('t');
    t.insert(0, 'abcdef');
    applyTextDiff(t, 'abef');
    expect(t.toString()).toBe('abef');
    applyTextDiff(t, 'abef');
    expect(t.toString()).toBe('abef');
    applyTextDiff(t, '');
    expect(t.toString()).toBe('');
  });
});

describe('remoteCursorCss', () => {
  const peer = (clientId: number, name: string, color = '#2563eb') => ({
    clientId,
    state: {
      user: { participantId: `p${clientId}`, name, color, role: 'candidate' },
      tab: 'code' as const,
    },
  });

  it('skips yourself and escapes names so they cannot break out of the CSS string', () => {
    const css = remoteCursorCss([peer(1, 'Me'), peer(2, 'Bad"} body{display:none')], 1);
    expect(css).not.toContain('yRemoteSelection-1 ');
    expect(css).toContain('.yRemoteSelectionHead-2::after { content: "Bad } body{display:none"');
  });

  it('ignores colours that are not plain hex', () => {
    const css = remoteCursorCss([peer(3, 'X', 'red;}*{color:red')], 1);
    expect(css).toContain('#888888');
    expect(css).not.toContain('red;}');
  });
});

describe('formatting', () => {
  it('formats session clocks', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65_000)).toBe('01:05');
    expect(formatClock(3_725_000)).toBe('1:02:05');
  });

  it('makes initials', () => {
    expect(initials('Asha')).toBe('A');
    expect(initials('Priya  Raman')).toBe('PR');
    expect(initials('')).toBe('?');
  });
});
