import type * as Y from 'yjs';

/**
 * The parts of an Excalidraw element the shared-board binding relies on. Everything else is
 * opaque JSON stored as is under the element's id in the shared doc's `board` map.
 */
export interface BoardElement {
  id: string;
  type: string;
  version: number;
  versionNonce: number;
  index?: string | null;
  [key: string]: unknown;
}

/** Transaction origin for writes made by this browser's board, so its observer can skip them. */
export const LOCAL_ORIGIN = Symbol('board-local');

export function isBoardElement(value: unknown): value is BoardElement {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.type === 'string' &&
    typeof v.version === 'number' &&
    typeof v.versionNonce === 'number' &&
    typeof v.x === 'number' &&
    typeof v.y === 'number'
  );
}

/** Excalidraw's rule: the higher version wins; on a tie the lower versionNonce wins. */
export function isNewer(candidate: BoardElement, current: unknown): boolean {
  if (!isBoardElement(current)) return true;
  return (
    candidate.version > current.version ||
    (candidate.version === current.version && candidate.versionNonce < current.versionNonce)
  );
}

/**
 * Writes the local elements that are newer than the shared copy. Elements are cloned, because
 * Excalidraw mutates its elements in place and Yjs keeps a reference to what it was given.
 * Returns how many elements were written.
 */
export function writeElements(
  board: Y.Map<Record<string, unknown>>,
  elements: readonly BoardElement[],
): number {
  const changed = elements.filter((el) => isNewer(el, board.get(el.id)));
  if (!changed.length) return 0;
  const write = () => {
    for (const el of changed) board.set(el.id, structuredClone(el));
  };
  if (board.doc) board.doc.transact(write, LOCAL_ORIGIN);
  else write();
  return changed.length;
}

/** Fractional indices compare as plain strings; ties (concurrent inserts) fall back to id. */
export function byIndex(a: BoardElement, b: BoardElement): number {
  const ai = a.index ?? '';
  const bi = b.index ?? '';
  if (ai !== bi) return ai < bi ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Valid elements for the given ids (all when omitted), cloned and in z-order. */
export function readElements(
  board: Y.Map<Record<string, unknown>>,
  ids?: Iterable<string>,
): BoardElement[] {
  const values = ids ? [...ids].map((id) => board.get(id)) : [...board.values()];
  return values
    .filter(isBoardElement)
    .map((el) => structuredClone(el))
    .sort(byIndex);
}
