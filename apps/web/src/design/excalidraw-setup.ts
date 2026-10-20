import '@excalidraw/excalidraw/index.css';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { BoardElement } from './board-sync';

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}

// Excalidraw's fonts are copied to /excalidraw/fonts at build time (see vite.config.ts), so the
// board never loads anything from a third-party CDN. Must be set before the first render.
window.EXCALIDRAW_ASSET_PATH = '/excalidraw/';

/** Board JSON from the shared doc, typed for Excalidraw (validated by isBoardElement). */
export function asExcalidraw(elements: BoardElement[]): OrderedExcalidrawElement[] {
  return elements as unknown as OrderedExcalidrawElement[];
}

export function asBoard(elements: readonly OrderedExcalidrawElement[]): BoardElement[] {
  return elements as unknown as BoardElement[];
}
