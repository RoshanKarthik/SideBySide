import type { ClientEvent } from '@sidebyside/shared';
import { getCodeMap } from '@sidebyside/shared/doc';
import { useEffect } from 'react';
import type * as Y from 'yjs';
import type { RoomConnection } from './use-room';

/** A single local edit bigger than this that wasn't a paste is reported as a large insert. */
const LARGE_INSERT_CHARS = 80;

let lastPasteAt = 0;

function send(conn: RoomConnection, event: ClientEvent) {
  conn.send({ kind: 'event', event });
}

/** Reports a paste into the code editor or the shared notes. */
export function reportPaste(conn: RoomConnection, target: 'code' | 'notes', text: string) {
  if (!text) return;
  lastPasteAt = Date.now();
  send(conn, {
    type: 'paste',
    payload: { chars: text.length, preview: text.slice(0, 200), target },
  });
}

/**
 * Tab and window focus signals, plus large non-paste inserts into the code. Everyone in the
 * room sees these, and the join notice says so; they are signals, never verdicts.
 */
export function useIntegritySignals(conn: RoomConnection | null) {
  useEffect(() => {
    if (!conn) return;
    let hiddenAt: number | null = null;
    let blurredAt: number | null = null;

    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        send(conn, { type: 'tab_hidden', payload: {} });
      } else if (hiddenAt !== null) {
        send(conn, { type: 'tab_visible', payload: { hiddenMs: Date.now() - hiddenAt } });
        hiddenAt = null;
        blurredAt = null;
      }
    };
    const onBlur = () => {
      // Switching tabs also blurs the window; the tab signal covers that case.
      setTimeout(() => {
        if (document.hidden || blurredAt !== null) return;
        blurredAt = Date.now();
        send(conn, { type: 'window_blur', payload: {} });
      }, 50);
    };
    const onFocus = () => {
      if (blurredAt === null) return;
      send(conn, { type: 'window_focus', payload: { awayMs: Date.now() - blurredAt } });
      blurredAt = null;
    };

    // Code typed (or injected) locally: Yjs marks our own transactions as local, so remote
    // edits and server-loaded starter code never count.
    const code = getCodeMap(conn.doc);
    const onCode = (events: Y.YEvent<Y.AbstractType<unknown>>[], tx: Y.Transaction) => {
      if (!tx.local || Date.now() - lastPasteAt < 500) return;
      let inserted = 0;
      for (const e of events) {
        for (const d of e.delta) {
          if (typeof d.insert === 'string') inserted = Math.max(inserted, d.insert.length);
        }
      }
      if (inserted > LARGE_INSERT_CHARS) {
        send(conn, { type: 'large_insert', payload: { chars: inserted, target: 'code' } });
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    code.observeDeep(onCode);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      code.unobserveDeep(onCode);
    };
  }, [conn?.doc, conn?.provider]); // eslint-disable-line react-hooks/exhaustive-deps -- conn is a new object each render; the doc and provider identify it.
}
