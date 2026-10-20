import type { Room } from '@sidebyside/shared';
import { useEffect, useState } from 'react';
import YProvider from 'y-partyserver/provider';
import * as Y from 'yjs';

export interface PrivateDoc {
  doc: Y.Doc;
  provider: YProvider;
  synced: boolean;
}

/**
 * Interviewers' private document: notes, rubric and timer. The server refuses this
 * connection to anyone who is not an interviewer in the room.
 */
export function usePrivateDoc(room: Room, enabled: boolean): PrivateDoc | null {
  const [live, setLive] = useState<{ doc: Y.Doc; provider: YProvider } | null>(null);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const name = `${room.id}--private`;
    const doc = new Y.Doc();
    // Interviewers are always signed in, so the session cookie authenticates the socket.
    const provider = new YProvider(window.location.host, name, doc, {
      prefix: `/collab/room/${name}`,
      protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
      maxBackoffTime: 5000,
    });
    const onSync = (s: boolean) => setSynced(s);
    provider.on('sync', onSync);
    const onClose = (event: CloseEvent) => {
      if (event.code === 4000 || event.code === 4401) provider.disconnect();
    };
    provider.on('connection-close', onClose);
    // Created by this effect and destroyed by its cleanup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLive({ doc, provider });
    return () => {
      provider.off('sync', onSync);
      provider.off('connection-close', onClose);
      provider.destroy();
      doc.destroy();
      setLive(null);
      setSynced(false);
    };
  }, [room.id, enabled]);

  return live ? { ...live, synced } : null;
}
