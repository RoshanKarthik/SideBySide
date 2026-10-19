import {
  serverMessageSchema,
  type ClientMessage,
  type Participant,
  type PresenceState,
  type Room,
  type RoomEvent,
  type SharedRun,
} from '@sidebyside/shared';
import { useEffect, useState, useSyncExternalStore } from 'react';
import YProvider from 'y-partyserver/provider';
import * as Y from 'yjs';
import { getGuestToken } from '@/lib/guest-tokens';
import { colorFor } from '@/lib/utils';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface Peer {
  clientId: number;
  state: PresenceState;
}

export interface RoomConnection {
  doc: Y.Doc;
  provider: YProvider;
  status: ConnectionStatus;
  synced: boolean;
  peers: Peer[];
  lastRun: SharedRun | null;
  events: RoomEvent[];
  ended: boolean;
  serverError: string | null;
  send: (message: ClientMessage) => boolean;
  setTab: (tab: PresenceState['tab']) => void;
  /** Shows a run immediately, before (or without) the server echoing it back. */
  showRun: (run: SharedRun) => void;
}

function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
  );
}

interface Live {
  doc: Y.Doc;
  provider: YProvider;
}

/** Connects to the room's shared document and tracks presence, runs and events. */
export function useRoom(room: Room, participant: Participant, slug: string): RoomConnection | null {
  const [live, setLive] = useState<Live | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>(
    'connecting',
  );
  const [everConnected, setEverConnected] = useState(false);
  const [synced, setSynced] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [lastRun, setLastRun] = useState<SharedRun | null>(null);
  const [events, setEvents] = useState<RoomEvent[]>([]);
  const [ended, setEnded] = useState(room.status === 'ended');
  const [serverError, setServerError] = useState<string | null>(null);
  const online = useOnline();

  useEffect(() => {
    const docName = `${room.id}--shared`;
    const doc = new Y.Doc();
    const provider = new YProvider(window.location.host, docName, doc, {
      prefix: `/collab/room/${docName}`,
      protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
      connect: false,
      maxBackoffTime: 5000,
      params: () => {
        const token = getGuestToken(slug);
        return token ? { token } : {};
      },
    });

    const onStatus = ({ status }: { status: 'connecting' | 'connected' | 'disconnected' }) => {
      setWsStatus(status);
      if (status === 'connected') setEverConnected(true);
    };
    const onSync = (s: boolean) => setSynced(s);
    // Awareness can change while another component renders (editors set their caret state
    // on creation), so read it after the current render.
    let awarenessQueued = false;
    const onAwareness = () => {
      if (awarenessQueued) return;
      awarenessQueued = true;
      queueMicrotask(readAwareness);
    };
    const readAwareness = () => {
      awarenessQueued = false;
      const list: Peer[] = [];
      provider.awareness.getStates().forEach((state, clientId) => {
        if ((state as Partial<PresenceState>).user) {
          list.push({ clientId, state: state as PresenceState });
        }
      });
      setPeers(list);
    };
    const onCustom = (raw: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
      const msg = serverMessageSchema.safeParse(parsed);
      if (!msg.success) return;
      const m = msg.data;
      if (m.kind === 'run_result') setLastRun(m.run);
      else if (m.kind === 'event') setEvents((prev) => [...prev.slice(-199), m.event]);
      else if (m.kind === 'session_ended') {
        setEnded(true);
        provider.disconnect();
      } else {
        setServerError(m.message);
        setTimeout(() => setServerError(null), 5000);
      }
    };
    const onClose = (event: CloseEvent) => {
      if (event.code === 4000) {
        setEnded(true);
        provider.disconnect();
      }
    };

    provider.on('status', onStatus);
    provider.on('sync', onSync);
    provider.on('custom-message', onCustom);
    provider.on('connection-close', onClose);
    provider.awareness.on('change', onAwareness);
    provider.awareness.setLocalStateField('user', {
      participantId: participant.id,
      name: participant.displayName,
      color: colorFor(participant.id),
      role: participant.role,
    } satisfies PresenceState['user']);
    provider.awareness.setLocalStateField('tab', 'discuss');
    void provider.connect();
    // The provider is created here and destroyed by this cleanup, so it cannot come from render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLive({ doc, provider });

    return () => {
      provider.off('status', onStatus);
      provider.off('sync', onSync);
      provider.off('custom-message', onCustom);
      provider.off('connection-close', onClose);
      provider.awareness.off('change', onAwareness);
      provider.destroy();
      doc.destroy();
      setLive(null);
      setSynced(false);
    };
  }, [room.id, slug, participant]);

  if (!live) return null;
  const { doc, provider } = live;

  let status: ConnectionStatus;
  if (!online) status = 'offline';
  else if (wsStatus === 'connected') status = 'connected';
  else status = everConnected ? 'reconnecting' : 'connecting';

  return {
    doc,
    provider,
    status,
    synced,
    peers,
    lastRun,
    events,
    ended,
    serverError,
    send: (message) => {
      if (!provider.wsconnected) return false;
      provider.sendMessage(JSON.stringify(message));
      return true;
    },
    setTab: (tab) => provider.awareness.setLocalStateField('tab', tab),
    showRun: (run) => setLastRun(run),
  };
}
