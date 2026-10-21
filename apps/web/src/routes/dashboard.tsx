import {
  DEFAULT_RETENTION_DAYS,
  LANGUAGES,
  LANGUAGE_INFO,
  RETENTION_DAYS,
  type CreateRoomInput,
  type CreateRoomResponse,
  type Lang,
  type RoomListItem,
} from '@sidebyside/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  CalendarClock,
  Check,
  Clock,
  Copy,
  FileText,
  History,
  MoreHorizontal,
  Plus,
  Radio,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { AppShell } from '@/components/layout';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  LiveDot,
  PageHeader,
  Skeleton,
  Spinner,
} from '@/components/ui/card';
import { Checkbox, Field, Input, Label, NativeSelect } from '@/components/ui/form';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/overlay';
import { toast } from '@/components/ui/toaster';
import { api } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { cn, formatDuration, timeAgo } from '@/lib/utils';

type StatusFilter = 'all' | 'live' | 'scheduled' | 'ended';
const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'scheduled', label: 'Upcoming' },
  { id: 'ended', label: 'Ended' },
];

const durationOf = (r: RoomListItem) =>
  r.startedAt && r.endedAt ? Date.parse(r.endedAt) - Date.parse(r.startedAt) : 0;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function DashboardPage() {
  const { data: session, isPending } = useSession();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [now] = useState(() => Date.now());
  const rooms = useQuery({
    queryKey: ['rooms'],
    queryFn: () => api.json<RoomListItem[]>('/rooms'),
    enabled: !!session,
  });

  const stats = useMemo(() => {
    const list = rooms.data ?? [];
    const monthAgo = now - 30 * 24 * 3600 * 1000;
    const ended = list.filter((r) => r.status === 'ended');
    return {
      live: list.filter((r) => r.status === 'live').length,
      month: list.filter((r) => Date.parse(r.createdAt) > monthAgo).length,
      time: ended.reduce((s, r) => s + durationOf(r), 0),
      practice: list.filter((r) => r.mode === 'practice').length,
    };
  }, [rooms.data, now]);

  if (isPending) return null;
  if (!session) return <Navigate to="/login?next=/dashboard" replace />;

  const q = query.trim().toLowerCase();
  const visible = (rooms.data ?? []).filter(
    (r) => (filter === 'all' || r.status === filter) && (!q || r.title.toLowerCase().includes(q)),
  );
  const firstName = session.user.name.split(' ')[0];

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
        <PageHeader
          title={`${greeting()}, ${firstName}`}
          description="Run an interview, practise with a peer, or look back at past sessions."
          actions={
            <>
              <Button variant="outline" asChild>
                <Link to="/questions">
                  <BookOpen /> Question bank
                </Link>
              </Button>
              <NewRoomDialog
                open={params.get('new') === '1'}
                onOpenChange={(o) => setParams(o ? { new: '1' } : {}, { replace: true })}
              />
            </>
          }
        />

        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={Radio} label="Live now" value={stats.live} accent={stats.live > 0} />
          <Stat icon={CalendarClock} label="Sessions, last 30 days" value={stats.month} />
          <Stat icon={Clock} label="Time interviewing" value={formatDuration(stats.time)} />
          <Stat icon={Users} label="Practice sessions" value={stats.practice} />
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-lg font-semibold">Sessions</h2>
          <div className="relative w-full sm:w-64">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              aria-label="Search sessions"
              placeholder="Search by title"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <div role="tablist" aria-label="Status" className="flex rounded-lg bg-muted p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'h-7 rounded-md px-3 text-[13px] font-medium text-muted-foreground',
                  filter === f.id && 'bg-background text-foreground shadow-sm',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          {rooms.isPending && (
            <div className="grid gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[72px] rounded-xl" />
              ))}
            </div>
          )}
          {rooms.error && <ErrorNote>{rooms.error.message}</ErrorNote>}
          {rooms.data && rooms.data.length === 0 && (
            <EmptyState
              icon={Radio}
              title="No sessions yet"
              action={
                <Button variant="glow" onClick={() => setParams({ new: '1' })}>
                  <Plus /> Create your first room
                </Button>
              }
            >
              Create a room, send the link, and the candidate joins with just their name.
            </EmptyState>
          )}
          {rooms.data && rooms.data.length > 0 && visible.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No sessions match.</p>
          )}
          <ul className="grid gap-2">
            {visible.map((room) => (
              <li key={room.id}>
                <RoomRow room={room} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Radio;
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className={cn('size-4 text-muted-foreground', accent && 'text-success')} />
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {accent && (
        <div className="absolute -right-6 -bottom-6 size-20 rounded-full bg-success/15 blur-xl" />
      )}
    </Card>
  );
}

function RoomRow({ room }: { room: RoomListItem }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.send(`/rooms/${room.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Session deleted');
      void queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (e) => toast.error(e.message),
  });
  const link = `${window.location.origin}/r/${room.slug}`;
  const ended = room.status === 'ended';
  const when = ended
    ? `Ended ${timeAgo(room.endedAt!)}`
    : room.status === 'live'
      ? `Started ${timeAgo(room.startedAt ?? room.createdAt)}`
      : `Created ${timeAgo(room.createdAt)}`;

  return (
    <Card className="card-glow group flex flex-wrap items-center gap-4 p-4">
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg border',
          room.status === 'live' ? 'border-success/30 bg-success/10' : 'bg-background',
        )}
      >
        {room.status === 'live' ? (
          <LiveDot />
        ) : room.mode === 'practice' ? (
          <Users className="size-4 text-muted-foreground" />
        ) : ended ? (
          <History className="size-4 text-muted-foreground" />
        ) : (
          <CalendarClock className="size-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={ended ? `/sessions/${room.id}` : `/r/${room.slug}`}
            className="truncate font-medium hover:underline"
          >
            {room.title}
          </Link>
          {room.status === 'live' && <Badge tone="success">Live</Badge>}
          {room.mode === 'practice' && <Badge tone="info">Practice</Badge>}
          {room.myRole !== 'owner' && room.mode !== 'practice' && <Badge>{room.myRole}</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {LANGUAGE_INFO[room.defaultLanguage].label} · {when}
          {ended && durationOf(room) > 0 && ` · ${formatDuration(durationOf(room))}`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {ended ? (
          <>
            <Button size="sm" variant="outline" asChild>
              <Link to={`/rooms/${room.id}/replay`}>Replay</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to={`/sessions/${room.id}`}>Summary</Link>
            </Button>
          </>
        ) : (
          <>
            {room.mode !== 'practice' && <CopyLinkButton link={link} />}
            <Button size="sm" asChild>
              <Link to={`/r/${room.slug}`}>{room.status === 'live' ? 'Rejoin' : 'Open'}</Link>
            </Button>
          </>
        )}
        <Menu>
          <MenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={`More for ${room.title}`}>
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent>
            {ended && (
              <MenuItem onSelect={() => navigate(`/sessions/${room.id}`)}>
                <FileText /> Session summary
              </MenuItem>
            )}
            {!ended && room.mode !== 'practice' && (
              <MenuItem
                onSelect={async () => {
                  await navigator.clipboard.writeText(link);
                  toast.success('Room link copied');
                }}
              >
                <Copy /> Copy candidate link
              </MenuItem>
            )}
            {room.myRole === 'owner' && (
              <>
                <MenuSeparator />
                <MenuItem
                  destructive
                  disabled={room.status === 'live'}
                  onSelect={() => setConfirm(true)}
                >
                  <Trash2 /> Delete session
                </MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent
          title="Delete this session?"
          description={`“${room.title}” and its replay, notes, code runs and rubric will be deleted for everyone. This can’t be undone.`}
        >
          <div className="mt-6 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate(undefined, { onSettled: () => setConfirm(false) })}
            >
              {remove.isPending && <Spinner />} Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        toast.success('Room link copied');
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  );
}

function NewRoomDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<CreateRoomResponse | null>(null);
  const [language, setLanguage] = useState<Lang>('python');
  const [shareReplay, setShareReplay] = useState(false);
  const [shareReport, setShareReport] = useState(false);

  const create = useMutation({
    mutationFn: (input: CreateRoomInput) =>
      api.json<CreateRoomResponse>('/rooms', { method: 'POST', body: input }),
    onSuccess: (res) => {
      setCreated(res);
      void queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    create.mutate({
      title: String(form.get('title')),
      defaultLanguage: language,
      shareReplayWithCandidate: shareReplay,
      shareReportWithCandidate: shareReport,
      retentionDays: Number(form.get('retention')),
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setCreated(null);
          create.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="glow">
          <Plus /> New room
        </Button>
      </DialogTrigger>
      <DialogContent
        title={created ? 'Room ready' : 'New interview room'}
        description={
          created
            ? 'Send this link to the candidate. They join with just their name.'
            : 'Create a room and share its link with the candidate.'
        }
        hideDescription={!created}
      >
        {created ? (
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-2 rounded-lg border bg-background/60 p-1.5 pl-3">
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{created.link}</span>
              <CopyLinkButton link={created.link} />
            </div>
            <div className="flex justify-end">
              <Button asChild>
                <Link to={`/r/${created.room.slug}`}>Open room</Link>
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="Title" htmlFor="title">
              <Input
                id="title"
                name="title"
                required
                maxLength={120}
                placeholder="Frontend round – Asha"
                autoFocus
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Language" htmlFor="language">
                <NativeSelect
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as Lang)}
                  className="w-full"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {LANGUAGE_INFO[l].label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Keep recording for" htmlFor="retention">
                <NativeSelect
                  id="retention"
                  name="retention"
                  defaultValue={DEFAULT_RETENTION_DAYS}
                  className="w-full"
                >
                  {RETENTION_DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d} days
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <div className="space-y-3 rounded-lg border bg-background/40 p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="share-replay"
                  checked={shareReplay}
                  onCheckedChange={(v) => setShareReplay(v === true)}
                />
                <Label htmlFor="share-replay" className="font-normal">
                  Share the replay with the candidate
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="share-report"
                  checked={shareReport}
                  onCheckedChange={(v) => setShareReport(v === true)}
                />
                <Label htmlFor="share-report" className="font-normal">
                  Share the feedback report with the candidate
                </Label>
              </div>
            </div>
            {create.error && <ErrorNote>{create.error.message}</ErrorNote>}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Spinner />}
                Create room
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
