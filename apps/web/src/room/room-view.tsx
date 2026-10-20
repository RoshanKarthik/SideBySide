import { isInterviewerRole, type JoinRoomResponse, type PresenceState } from '@sidebyside/shared';
import { useMutation } from '@tanstack/react-query';
import { Code2, NotebookPen, PanelRight, PenTool, X } from 'lucide-react';
import { Suspense, lazy, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Logo, ThemeToggle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { ErrorNote, Spinner } from '@/components/ui/card';
import { api } from '@/lib/api';
import { cn, colorFor } from '@/lib/utils';
import { NotesEditor } from '@/notes/notes-editor';
import { InterviewerPanel } from './interviewer-panel';
import { ConnectionIndicator, PresenceAvatars, SessionTimer } from './top-bar';
import { usePrivateDoc } from './use-private-doc';
import { useRoom } from './use-room';
import { useTestHost } from './use-test-host';

// Monaco is large; it loads the first time someone opens the Code tab.
const CodePanel = lazy(() => import('@/editor/code-panel'));
// Same for the whiteboard and the Design tab.
const DesignBoard = lazy(() => import('@/design/design-board'));

type Tab = PresenceState['tab'];
const TABS: { id: Tab; label: string; icon: typeof Code2 }[] = [
  { id: 'discuss', label: 'Discuss', icon: NotebookPen },
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'design', label: 'Design', icon: PenTool },
];

export function RoomView({ slug, membership }: { slug: string; membership: JoinRoomResponse }) {
  const { room, participant } = membership;
  const conn = useRoom(room, participant, slug);
  const [tab, setTab] = useState<Tab>('discuss');
  const [codeOpened, setCodeOpened] = useState(false);
  const [designOpened, setDesignOpened] = useState(false);
  const interviewer = isInterviewerRole(participant.role);
  const privateDoc = usePrivateDoc(room, interviewer);
  const runningTestsFor = useTestHost(conn, room, slug, interviewer);
  const [panelOpen, setPanelOpen] = useState(false);
  const [startedAt] = useState(() => (room.startedAt ? Date.parse(room.startedAt) : Date.now()));

  const end = useMutation({
    mutationFn: () => api.json(`/rooms/${room.id}/end`, { method: 'POST', roomKey: slug }),
  });

  // Development only: lets browser tests inspect the shared document.
  useEffect(() => {
    if (import.meta.env.DEV && conn) {
      (window as unknown as { __sbsRoom?: unknown }).__sbsRoom = conn;
    }
  }, [conn]);

  if (!conn) return null;
  if (conn.ended || end.isSuccess) {
    return <SessionEnded title={room.title} roomId={room.id} interviewer={interviewer} />;
  }

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    setTab(next);
    if (next === 'code') setCodeOpened(true);
    if (next === 'design') setDesignOpened(true);
    conn.setTab(next);
    conn.send({ kind: 'event', event: { type: 'tab_changed', payload: { tab: next } } });
  };

  const user: PresenceState['user'] = {
    participantId: participant.id,
    name: participant.displayName,
    color: colorFor(participant.id),
    role: participant.role,
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-3 py-2">
        <div className="hidden sm:block">
          <Logo />
        </div>
        <h1 className="min-w-0 flex-1 truncate font-semibold">{room.title}</h1>
        <SessionTimer startedAt={startedAt} />
        <ConnectionIndicator status={conn.status} />
        <PresenceAvatars peers={conn.peers} selfClientId={conn.doc.clientID} />
        {interviewer && (
          <Button
            variant="destructive"
            size="sm"
            disabled={end.isPending}
            onClick={() => {
              if (
                window.confirm(
                  'End the session for everyone? The room will close and the replay will be saved.',
                )
              ) {
                end.mutate();
              }
            }}
          >
            {end.isPending && <Spinner />}
            End session
          </Button>
        )}
        {interviewer && (
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen(true)}
          >
            <PanelRight /> Panel
          </Button>
        )}
        <ThemeToggle />
      </header>

      <nav role="tablist" aria-label="Room" className="flex gap-1 border-b px-3">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => switchTab(id)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground',
              tab === id && 'border-primary text-foreground',
            )}
          >
            <Icon className="size-4" />
            {label}
            <TabPeers peers={conn.peers} tab={id} self={conn.doc.clientID} />
          </button>
        ))}
      </nav>

      {(end.error || conn.serverError) && (
        <div className="px-3 pt-2">
          <ErrorNote>{end.error?.message ?? conn.serverError}</ErrorNote>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          {!conn.synced && (
            <div className="absolute inset-x-0 top-0 z-10 flex justify-center p-2">
              <span className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                <Spinner className="size-3" /> Syncing the room…
              </span>
            </div>
          )}
          <section role="tabpanel" hidden={tab !== 'discuss'} className="h-full">
            <NotesEditor
              doc={conn.doc}
              provider={conn.provider}
              user={user}
              editable={interviewer || !conn.locked}
            />
          </section>
          {codeOpened && (
            <section role="tabpanel" hidden={tab !== 'code'} className="h-full">
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Spinner /> Loading the editor…
                  </div>
                }
              >
                <CodePanel conn={conn} participant={participant} interviewer={interviewer} />
              </Suspense>
            </section>
          )}
          {designOpened && (
            <section role="tabpanel" hidden={tab !== 'design'} className="h-full">
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Spinner /> Loading the whiteboard…
                  </div>
                }
              >
                <DesignBoard
                  conn={conn}
                  interviewer={interviewer}
                  active={tab === 'design'}
                  readOnly={!interviewer && conn.locked}
                />
              </Suspense>
            </section>
          )}
        </main>
        {interviewer && (
          <>
            {panelOpen && (
              <div
                className="fixed inset-0 z-30 bg-black/40 lg:hidden"
                onClick={() => setPanelOpen(false)}
                aria-hidden
              />
            )}
            <aside
              aria-label="Interviewer panel"
              className={cn(
                'fixed inset-y-0 right-0 z-40 w-[22rem] max-w-full border-l bg-background transition-transform lg:static lg:z-auto lg:translate-x-0',
                panelOpen ? 'translate-x-0' : 'translate-x-full',
              )}
            >
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1.5 right-1.5 z-10 lg:hidden"
                aria-label="Close panel"
                onClick={() => setPanelOpen(false)}
              >
                <X />
              </Button>
              <InterviewerPanel
                room={room}
                slug={slug}
                conn={conn}
                privateDoc={privateDoc}
                isOwner={participant.role === 'owner'}
                user={user}
                sessionStart={startedAt}
                runningTestsFor={runningTestsFor}
              />
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

function TabPeers({
  peers,
  tab,
  self,
}: {
  peers: { clientId: number; state: PresenceState }[];
  tab: Tab;
  self: number;
}) {
  const here = peers.filter((p) => p.clientId !== self && p.state.tab === tab);
  if (!here.length) return null;
  return (
    <span className="flex -space-x-1" aria-label={`${here.length} here`}>
      {here.slice(0, 3).map((p) => (
        <span
          key={p.clientId}
          className="size-2 rounded-full ring-1 ring-background"
          style={{ background: p.state.user.color }}
        />
      ))}
    </span>
  );
}

function SessionEnded({
  title,
  roomId,
  interviewer,
}: {
  title: string;
  roomId: string;
  interviewer: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-bold">Session ended</h1>
      <p className="text-muted-foreground">{title}</p>
      {interviewer ? (
        <div className="mt-2 flex gap-2">
          <Button asChild>
            <Link to={`/rooms/${roomId}/replay`}>Watch the replay</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/dashboard">Dashboard</Link>
          </Button>
        </div>
      ) : (
        <p className="max-w-sm text-sm text-muted-foreground">
          Thanks for joining. You can close this tab.
        </p>
      )}
    </div>
  );
}
