import { useCallback, useSyncExternalStore } from 'react';
import type * as Y from 'yjs';

const versions = new WeakMap<Y.Doc, number>();

/** A number that changes whenever the document changes (locally or from others). */
export function useDocVersion(doc: Y.Doc): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const handler = () => {
        versions.set(doc, (versions.get(doc) ?? 0) + 1);
        onChange();
      };
      doc.on('update', handler);
      return () => doc.off('update', handler);
    },
    [doc],
  );
  return useSyncExternalStore(subscribe, () => versions.get(doc) ?? 0);
}
