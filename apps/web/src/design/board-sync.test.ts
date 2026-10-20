import { getBoard } from '@sidebyside/shared/doc';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { LOCAL_ORIGIN, readElements, writeElements, type BoardElement } from './board-sync';

function el(id: string, version: number, extra: Partial<BoardElement> = {}): BoardElement {
  return { id, type: 'rectangle', x: 0, y: 0, version, versionNonce: 5, index: 'a0', ...extra };
}

function sync(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

describe('board sync', () => {
  it('writes only elements newer than the shared copy', () => {
    const board = getBoard(new Y.Doc());
    expect(writeElements(board, [el('a', 1), el('b', 1)])).toBe(2);
    expect(writeElements(board, [el('a', 1), el('b', 2)])).toBe(1);
    expect(board.get('b')?.version).toBe(2);
    // Same version: the lower nonce wins, as in Excalidraw's reconciliation.
    expect(writeElements(board, [el('a', 1, { versionNonce: 9 })])).toBe(0);
    expect(writeElements(board, [el('a', 1, { versionNonce: 1 })])).toBe(1);
  });

  it('notices in-place mutation of an element it already wrote', () => {
    const board = getBoard(new Y.Doc());
    const element = el('a', 1);
    writeElements(board, [element]);
    // Excalidraw's mutateElement changes the same object.
    element.version = 2;
    element.x = 40;
    expect(writeElements(board, [element])).toBe(1);
    expect(board.get('a')?.x).toBe(40);
  });

  it('tags local writes so the observer can skip its own changes', () => {
    const doc = new Y.Doc();
    const origins: unknown[] = [];
    getBoard(doc).observe((_e, tx) => origins.push(tx.origin));
    writeElements(getBoard(doc), [el('a', 1)]);
    expect(origins).toEqual([LOCAL_ORIGIN]);
  });

  it('converges when two clients edit concurrently', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    writeElements(getBoard(a), [el('shared', 1)]);
    sync(a, b);
    // Both move the same element; B made more edits, so B's version is higher.
    writeElements(getBoard(a), [el('shared', 2, { x: 10 })]);
    writeElements(getBoard(b), [el('shared', 4, { x: 99 }), el('fromB', 1, { index: 'a1' })]);
    sync(a, b);
    for (const doc of [a, b]) {
      const elements = readElements(getBoard(doc));
      expect(elements.map((e) => e.id)).toEqual(['shared', 'fromB']);
    }
    expect(readElements(getBoard(a))).toEqual(readElements(getBoard(b)));
  });

  it('reads valid elements in z-order and ignores junk', () => {
    const board = getBoard(new Y.Doc());
    writeElements(board, [el('top', 1, { index: 'a2' }), el('bottom', 1, { index: 'a1' })]);
    board.set('junk', { id: 'junk', type: 'rectangle' });
    expect(readElements(board).map((e) => e.id)).toEqual(['bottom', 'top']);
    expect(readElements(board, ['top', 'missing']).map((e) => e.id)).toEqual(['top']);
  });
});
