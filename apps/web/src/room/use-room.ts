import {
  roomDocumentName,
  serverMessageSchema,
  type ClientMessage,
  type Participant,
  type PresenceState,
  type Room,
  type RoomEvent,
  type ServerMessage,
  type SharedRun,
  type TestRun,
} from '@sidebyside/shared';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
  /** Practice: the peers moved to this round; the room reloads into it. */
  roundChanged: number | null;
  serverError: string | null;
  send: (message: ClientMessage) => boolean;
  setTab: (tab: PresenceState['tab']) => void;
  /** Shows a run immediately, before (or without) the server echoing it back. */
  showRun: (run: SharedRun) => void;
  /** The interviewer has made the room read-only for candidates. */
  locked: boolean;
  lastTestRun: TestRun | null;
  /** The test run this browser asked for and is waiting on, if any. */
  pendingTestRequest: string | null;
  testError: string | null;
  requestTests: (questionId: string, language: TestRun['language']) => void;
  /** Interviewers: called when the room asks this browser to run tests. */
  onTestsRequested: (handler: TestsRequestedHandler | null) => void;
}

export type TestsRequest = Extract<ServerMessage, { kind: 'tests_requested' }>;
export type TestsRequestedHandler = (request: TestsRequest) => void;

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
  const [roundChanged, setRoundChanged] = useState<number | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [lastTestRun, setLastTestRun] = useState<TestRun | null>(null);
  const [pendingTestRequest, setPendingTestRequest] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const testsHandler = useRef<TestsRequestedHandler | null>(null);
  const online = useOnline();

  useEffect(() => {
    const docName = roomDocumentName(room.id, 'shared', room.currentRound);
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
    // Whiteboard pointers and editor carets change awareness constantly; only re-render the
    // room when who is here, or which tab they're on, changes.
    let peersKey = '';
    const readAwareness = () => {
      awarenessQueued = false;
      const list: Peer[] = [];
      provider.awareness.getStates().forEach((state, clientId) => {
        if ((state as Partial<PresenceState>).user) {
          list.push({ clientId, state: state as PresenceState });
        }
      });
      const key = JSON.stringify(list.map((p) => [p.clientId, p.state.user, p.state.tab]));
      if (key === peersKey) return;
      peersKey = key;
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
      switch (m.kind) {
        case 'run_result':
          setLastRun(m.run);
          break;
        case 'event':
          setEvents((prev) => [...prev.slice(-199), m.event]);
          break;
        case 'session_ended':
          setEnded(true);
          provider.disconnect();
          break;
        case 'round_changed':
          setRoundChanged(m.round);
          provider.disconnect();
          break;
        case 'lock_state':
          setLocked(m.locked);
          break;
        case 'tests_requested':
          testsHandler.current?.(m);
          break;
        case 'tests_result':
          setLastTestRun(m.run);
          setPendingTestRequest((cur) => (cur === m.run.requestId ? null : cur));
          break;
        case 'tests_failed':
          setPendingTestRequest((cur) => (cur === m.requestId ? null : cur));
          setTestError(m.message);
          break;
        case 'error':
          setServerError(m.message);
          setTimeout(() => setServerError(null), 5000);
          break;
      }
    };
    const onClose = (event: CloseEvent) => {
      if (event.code === 4000) {
        setEnded(true);
        provider.disconnect();
      } else if (event.code === 4001) {
        setRoundChanged((r) => r ?? room.currentRound + 1);
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
  }, [room.id, room.currentRound, slug, participant]);

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
    roundChanged,
    serverError,
    send: (message) => {
      if (!provider.wsconnected) return false;
      provider.sendMessage(JSON.stringify(message));
      return true;
    },
    setTab: (tab) => provider.awareness.setLocalStateField('tab', tab),
    showRun: (run) => setLastRun(run),
    locked,
    lastTestRun,
    pendingTestRequest,
    testError,
    requestTests: (questionId, language) => {
      const requestId = crypto.randomUUID();
      setTestError(null);
      if (!provider.wsconnected) {
        setTestError('You are offline; tests run once you reconnect.');
        return;
      }
      setPendingTestRequest(requestId);
      provider.sendMessage(JSON.stringify({ kind: 'run_tests', requestId, questionId, language }));
      // The room gives up after two minutes; don't spin forever if its answer is lost.
      setTimeout(() => {
        setPendingTestRequest((cur) => {
          if (cur !== requestId) return cur;
          queueMicrotask(() => setTestError('No answer from the test run. Try again.'));
          return null;
        });
      }, 130_000);
    },
    onTestsRequested: (handler) => {
      testsHandler.current = handler;
    },
  };
}
