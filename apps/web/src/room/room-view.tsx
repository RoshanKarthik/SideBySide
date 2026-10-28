import { isInterviewerRole, type JoinRoomResponse, type PresenceState } from '@sidebyside/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Check,
  Code2,
  Link2,
  Lock,
  NotebookPen,
  PanelRight,
  PenTool,
  X,
} from 'lucide-react';
import { Suspense, lazy, useEffect, useState } from 'react';
import { Link } from '@/lib/navigation';
import { CallControls, CallDock } from '@/call/call-ui';
import type { LocalMedia } from '@/call/local-media';
import { useCall } from '@/call/use-call';
import { BrandMark, brandStyle } from '@/components/brand';
import { ThemeToggle } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Badge, ErrorNote, Spinner } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Tooltip,
} from '@/components/ui/overlay';
import { toast } from '@/components/ui/toaster';
import { api } from '@/lib/api';
import { cn, colorFor } from '@/lib/utils';
import { NotesEditor } from '@/notes/notes-editor';
import { ActivityStrip, describeSignals, useSignals } from './activity-feed';
import { reportPaste, useIntegritySignals } from './integrity';
import { JoinNotice } from './room-extras';
import { ConnectionIndicator, PresenceAvatars, SessionTimer } from './top-bar';
import { usePrivateDoc } from './use-private-doc';
import { useRoom } from './use-room';
import { useTestHost } from './use-test-host';

// Only interviewers see this panel, so candidates never download it.
const InterviewerPanel = lazy(() =>
  import('./interviewer-panel').then((m) => ({ default: m.InterviewerPanel })),
);
// Shown only once the session is over.
const SessionEnded = lazy(() => import('./session-ended'));
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

export function RoomView({
  slug,
  membership,
  media,
  startInCall = false,
}: {
  slug: string;
  membership: JoinRoomResponse;
  media: LocalMedia;
  startInCall?: boolean;
}) {
  const { room, participant, brand } = membership;
  const conn = useRoom(room, participant, slug);
  const call = useCall(conn, media);
  const [autoJoined, setAutoJoined] = useState(false);
  if (startInCall && !autoJoined && conn) {
    setAutoJoined(true);
    call.join();
  }
  const [tab, setTab] = useState<Tab>('discuss');
  const [codeOpened, setCodeOpened] = useState(false);
  const [designOpened, setDesignOpened] = useState(false);
  const interviewer = isInterviewerRole(participant.role);
  const privateDoc = usePrivateDoc(room, interviewer);
  const runningTestsFor = useTestHost(conn, room, slug, interviewer);
  const [panelOpen, setPanelOpen] = useState(false);
  const [startedAt] = useState(() => (room.startedAt ? Date.parse(room.startedAt) : Date.now()));
  const queryClient = useQueryClient();
  const practice = room.mode === 'practice';

  const end = useMutation({
    mutationFn: () => api.json(`/rooms/${room.id}/end`, { method: 'POST', roomKey: slug }),
  });
  const swap = useMutation({
    mutationFn: () => api.json(`/rooms/${room.id}/rounds/next`, { method: 'POST', roomKey: slug }),
  });

  useIntegritySignals(conn);
  const { events: signalEvents, names } = useSignals(conn, room.id, slug);
  const signals = describeSignals(signalEvents, participant.id, names);

  // Practice: the peers swapped roles. Reload who we are, which reopens the room in round 2.
  const roundChanged = conn?.roundChanged ?? null;
  useEffect(() => {
    if (roundChanged === null) return;
    toast.success(`Round ${roundChanged}: roles swapped`);
    void queryClient.invalidateQueries({ queryKey: ['room-me', slug] });
  }, [roundChanged, queryClient, slug]);

  // Development only: lets browser tests inspect the shared document.
  useEffect(() => {
    if (import.meta.env.DEV && conn) {
      (window as unknown as { __sbsRoom?: unknown }).__sbsRoom = conn;
    }
  }, [conn]);

  // Leaving the room (or the session ending) turns the camera and microphone off.
  const ended = !!conn && (conn.ended || end.isSuccess);
  const releaseMedia = media.release;
  useEffect(() => {
    if (ended) releaseMedia();
  }, [ended, releaseMedia]);

  if (!conn) return null;
  if (conn.ended || end.isSuccess) {
    return (
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Spinner />
          </div>
        }
      >
        <SessionEnded
          title={room.title}
          roomId={room.id}
          interviewer={interviewer || practice}
          practice={practice}
          slug={slug}
        />
      </Suspense>
    );
  }
  const partner = practice
    ? conn.peers.find((p) => p.state.user.participantId !== participant.id)?.state.user.name
    : undefined;

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
    <div className="flex h-full flex-col bg-background" style={brandStyle(brand)}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card px-3 py-2">
        <Link
          to={interviewer ? '/dashboard' : '#'}
          aria-label={interviewer ? 'Back to dashboard' : (brand?.companyName ?? 'SideBySide')}
          className="shrink-0"
        >
          <BrandMark brand={brand} compact />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate font-semibold">{room.title}</h1>
          {room.mode === 'practice' && <Badge tone="info">Practice</Badge>}
          {conn.locked && (
            <Badge tone="warning">
              <Lock className="size-3" /> Locked
            </Badge>
          )}
        </div>
        <SessionTimer startedAt={startedAt} />
        <ConnectionIndicator status={conn.status} />
        <PresenceAvatars peers={conn.peers} selfClientId={conn.doc.clientID} />
        <span className="hidden h-6 w-px bg-border sm:block" aria-hidden />
        <CallControls call={call} media={media} />
        {interviewer && !practice && <CopyCandidateLink slug={slug} />}
        {interviewer && <EndSessionButton pending={end.isPending} onConfirm={() => end.mutate()} />}
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

      <nav
        role="tablist"
        aria-label="Room"
        className="flex items-center gap-1 border-b bg-card px-3"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => switchTab(id)}
            className={cn(
              'relative flex h-10 items-center gap-1.5 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
              tab === id &&
                'text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary',
            )}
          >
            <Icon className={cn('size-4', tab === id && 'text-primary')} />
            {label}
            <TabPeers peers={conn.peers} tab={id} self={conn.doc.clientID} />
          </button>
        ))}
      </nav>

      {practice && (
        <div className="flex flex-wrap items-center gap-3 border-b bg-primary/[0.06] px-3 py-2 text-sm">
          <Badge tone="info">Round {room.currentRound} of 2</Badge>
          <span>
            {interviewer ? (
              <>
                <strong>You interview</strong>, {partner ?? 'your partner'} solves. Pick a question
                in the panel.
              </>
            ) : (
              <>
                {partner ?? 'Your partner'} interviews, <strong>you solve</strong>.
              </>
            )}
          </span>
          {room.currentRound < 2 && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              disabled={swap.isPending}
              onClick={() => swap.mutate()}
            >
              {swap.isPending ? <Spinner /> : <ArrowLeftRight />} Swap roles
            </Button>
          )}
        </div>
      )}
      {!interviewer && !practice && <JoinNotice slug={slug} />}

      {(end.error || swap.error || conn.serverError) && (
        <div className="px-3 pt-2">
          <ErrorNote>{end.error?.message ?? swap.error?.message ?? conn.serverError}</ErrorNote>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="relative flex min-w-0 flex-1 flex-col">
          {!conn.synced && (
            <div className="absolute inset-x-0 top-0 z-10 flex justify-center p-2">
              <span className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                <Spinner className="size-3" /> Syncing the room…
              </span>
            </div>
          )}
          <section role="tabpanel" hidden={tab !== 'discuss'} className="min-h-0 flex-1">
            <NotesEditor
              doc={conn.doc}
              provider={conn.provider}
              user={user}
              editable={interviewer || !conn.locked}
              onPaste={(text) => reportPaste(conn, 'notes', text)}
            />
          </section>
          {codeOpened && (
            <section role="tabpanel" hidden={tab !== 'code'} className="min-h-0 flex-1">
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
            <section role="tabpanel" hidden={tab !== 'design'} className="min-h-0 flex-1">
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
          <CallDock
            call={call}
            media={media}
            self={{ name: participant.displayName, id: participant.id }}
          />
          {!interviewer && <ActivityStrip signals={signals} sessionStart={startedAt} />}
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
                'fixed inset-y-0 right-0 z-40 w-[22rem] max-w-full border-l bg-background transition-transform lg:static lg:bg-card/30 lg:z-auto lg:translate-x-0',
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
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Spinner />
                  </div>
                }
              >
                <InterviewerPanel
                  room={room}
                  slug={slug}
                  conn={conn}
                  privateDoc={privateDoc}
                  isOwner={participant.role === 'owner'}
                  user={user}
                  sessionStart={startedAt}
                  runningTestsFor={runningTestsFor}
                  signals={signals}
                />
              </Suspense>
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

function CopyCandidateLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip content="Copy the link candidates use to join">
      <Button
        variant="outline"
        size="sm"
        className="hidden md:inline-flex"
        onClick={async () => {
          await navigator.clipboard.writeText(`${window.location.origin}/r/${slug}`);
          setCopied(true);
          toast.success('Room link copied');
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check /> : <Link2 />} {copied ? 'Copied' : 'Copy link'}
      </Button>
    </Tooltip>
  );
}

function EndSessionButton({ pending, onConfirm }: { pending: boolean; onConfirm: () => void }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" disabled={pending}>
          {pending && <Spinner />}
          End session
        </Button>
      </DialogTrigger>
      <DialogContent
        title="End the session for everyone?"
        description="The room closes for all participants and the replay is saved. This can't be undone."
      >
        <div className="mt-6 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Keep going</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="destructive" onClick={onConfirm}>
              End session
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
