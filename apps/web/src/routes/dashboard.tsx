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
  ArrowDownUp,
  BookOpen,
  CalendarClock,
  Check,
  Clock,
  Copy,
  FileText,
  Gauge,
  History,
  MoreHorizontal,
  Plus,
  Radio,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { Link, useNavigate } from '@/lib/navigation';
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
  Avatar,
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
  { id: 'ended', label: 'Completed' },
];

type SortKey = 'date' | 'score' | 'candidate';

const durationOf = (r: RoomListItem) =>
  r.startedAt && r.endedAt ? Date.parse(r.endedAt) - Date.parse(r.startedAt) : 0;

const dateOf = (r: RoomListItem) => Date.parse(r.endedAt ?? r.startedAt ?? r.createdAt);

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function DashboardPage() {
  const { data: session, isPending } = useSession();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('date');
  const [now] = useState(() => Date.now());
  const rooms = useQuery({
    queryKey: ['rooms'],
    queryFn: () => api.json<RoomListItem[]>('/rooms'),
    enabled: !!session,
  });

  const stats = useMemo(() => {
    // Sessions someone saved to their account as the candidate aren't interviews they ran.
    const list = (rooms.data ?? []).filter((r) => r.myRole !== 'candidate');
    const monthAgo = now - 30 * 24 * 3600 * 1000;
    const ended = list.filter((r) => r.status === 'ended');
    const scored = list.filter((r) => r.score !== null && r.mode === 'interview');
    return {
      live: list.filter((r) => r.status === 'live').length,
      month: list.filter((r) => r.mode === 'interview' && Date.parse(r.createdAt) > monthAgo)
        .length,
      avgScore: scored.length
        ? Math.round(scored.reduce((sum, r) => sum + (r.score ?? 0), 0) / scored.length)
        : null,
      time: ended.reduce((sum, r) => sum + durationOf(r), 0),
    };
  }, [rooms.data, now]);

  if (isPending) return null;
  if (!session) return <Navigate to="/login?next=/dashboard" replace />;

  const q = query.trim().toLowerCase();
  const all = rooms.data ?? [];
  const active = all.filter((r) => r.status !== 'ended');
  const visible = all
    .filter(
      (r) =>
        (filter === 'all' || r.status === filter) &&
        (!q ||
          r.title.toLowerCase().includes(q) ||
          (r.candidateName ?? '').toLowerCase().includes(q)),
    )
    .sort((a, b) =>
      sort === 'score'
        ? (b.score ?? -1) - (a.score ?? -1)
        : sort === 'candidate'
          ? (a.candidateName ?? '~').localeCompare(b.candidateName ?? '~')
          : dateOf(b) - dateOf(a),
    );
  const firstName = session.user.name.split(' ')[0];

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
        <PageHeader
          title={`${greeting()}, ${firstName}`}
          description="Your interviews, candidates and results in one place."
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

        <div className="stagger mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={Radio} label="Live now" value={stats.live} accent={stats.live > 0} />
          <Stat icon={CalendarClock} label="Interviews, last 30 days" value={stats.month} />
          <Stat
            icon={Gauge}
            label="Average test score"
            value={stats.avgScore === null ? '—' : `${stats.avgScore}/100`}
          />
          <Stat icon={Clock} label="Time interviewing" value={formatDuration(stats.time)} />
        </div>

        {active.length > 0 && (
          <section className="mt-10">
            <h2 className="text-base font-semibold">Live and upcoming</h2>
            <ul className="stagger mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {active.slice(0, 6).map((room) => (
                <li key={room.id}>
                  <ActiveRoomCard room={room} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-10">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-base font-semibold">Candidates and sessions</h2>
            <div className="relative w-full sm:w-64">
              <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                aria-label="Search sessions"
                placeholder="Search candidate or title"
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
                    filter === f.id && 'bg-card text-foreground shadow-sm',
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
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            )}
            {rooms.error && <ErrorNote>{rooms.error.message}</ErrorNote>}
            {rooms.data && rooms.data.length === 0 && (
              <EmptyState
                icon={Radio}
                title="No interviews yet"
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
            {visible.length > 0 && (
              <Card className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground max-md:hidden">
                    <tr>
                      <SortHeader
                        label="Candidate"
                        active={sort === 'candidate'}
                        onClick={() => setSort('candidate')}
                      />
                      <th className="px-4 py-2.5 font-medium">Interview</th>
                      <SortHeader
                        label="Date"
                        active={sort === 'date'}
                        onClick={() => setSort('date')}
                      />
                      <th className="px-4 py-2.5 font-medium">Duration</th>
                      <SortHeader
                        label="Score"
                        active={sort === 'score'}
                        onClick={() => setSort('score')}
                      />
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="stagger divide-y">
                    {visible.map((room) => (
                      <RoomRow key={room.id} room={room} />
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function SortHeader({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <th className="px-4 py-2.5 font-medium" aria-sort={active ? 'descending' : 'none'}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground',
          active && 'text-foreground',
        )}
      >
        {label}
        <ArrowDownUp className={cn('size-3', !active && 'opacity-40')} />
      </button>
    </th>
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
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span
          className={cn(
            'flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground',
            accent && 'bg-success/10 text-success',
          )}
        >
          <Icon className="size-3.5" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
    </Card>
  );
}

function ActiveRoomCard({ room }: { room: RoomListItem }) {
  const live = room.status === 'live';
  const link = `${window.location.origin}/r/${room.slug}`;
  return (
    <Card className="flex h-full flex-col p-4">
      <div className="flex items-center gap-2">
        {live ? (
          <Badge tone="success">
            <LiveDot className="size-1.5" /> Live
          </Badge>
        ) : (
          <Badge>Upcoming</Badge>
        )}
        {room.mode === 'practice' && <Badge tone="info">Practice</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">
          {live
            ? `Started ${timeAgo(room.startedAt ?? room.createdAt)}`
            : `Created ${timeAgo(room.createdAt)}`}
        </span>
      </div>
      <p className="mt-3 truncate font-medium">{room.title}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {room.candidateName ? `with ${room.candidateName}` : 'Waiting for the candidate'} ·{' '}
        {LANGUAGE_INFO[room.defaultLanguage].label}
      </p>
      <div className="mt-4 flex gap-2">
        <Button size="sm" className="flex-1" asChild>
          <Link to={`/r/${room.slug}`}>{live ? 'Rejoin' : 'Open room'}</Link>
        </Button>
        {room.mode !== 'practice' && <CopyLinkButton link={link} />}
      </div>
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
  const duration = durationOf(room);
  // A candidate who saved a session can open its replay when it was shared, never the summary.
  const candidate = room.myRole === 'candidate';
  const replay = !candidate || room.shareReplayWithCandidate;
  const open = !ended
    ? `/r/${room.slug}`
    : candidate
      ? replay
        ? `/rooms/${room.id}/replay`
        : null
      : `/sessions/${room.id}`;

  return (
    <tr className="transition-colors hover:bg-muted/40 max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-1 max-md:px-4 max-md:py-3">
      <td className="px-4 py-3 max-md:w-full max-md:p-0">
        <div className="flex items-center gap-2.5">
          {room.candidateName ? (
            <Avatar name={room.candidateName} size={28} />
          ) : (
            <span className="flex size-7 items-center justify-center rounded-full border border-dashed text-muted-foreground">
              <Users className="size-3.5" />
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {room.candidateName ?? (
                <span className="font-normal text-muted-foreground">No candidate yet</span>
              )}
            </span>
            {room.mode === 'practice' && (
              <span className="text-xs text-muted-foreground">Practice partner</span>
            )}
          </span>
        </div>
      </td>
      <td className="max-w-[16rem] px-4 py-3 max-md:max-w-none max-md:p-0">
        {open ? (
          <Link to={open} className="block truncate hover:underline">
            {room.title}
          </Link>
        ) : (
          <span className="block truncate">{room.title}</span>
        )}
        <span className="text-xs text-muted-foreground">
          {LANGUAGE_INFO[room.defaultLanguage].label}
          {room.myRole !== 'owner' && room.mode !== 'practice' && ` · ${room.myRole}`}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground max-md:p-0 max-md:text-xs">
        {new Date(dateOf(room)).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums max-md:p-0 max-md:text-xs">
        {duration > 0 ? formatDuration(duration) : '—'}
      </td>
      <td className="px-4 py-3 max-md:p-0">
        {room.score !== null ? (
          <span className="flex items-center gap-2">
            <ScoreBar score={room.score} />
            <span className="text-xs text-muted-foreground tabular-nums">
              {room.testsPassed}/{room.testsTotal}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3 max-md:p-0">
        {room.status === 'live' ? (
          <Badge tone="success">Live</Badge>
        ) : ended ? (
          <Badge>Completed</Badge>
        ) : (
          <Badge tone="info">Upcoming</Badge>
        )}
      </td>
      <td className="px-4 py-3 text-right max-md:ml-auto max-md:p-0">
        <div className="flex items-center justify-end gap-1.5">
          {ended ? (
            open && (
              <Button size="sm" variant="outline" asChild>
                <Link to={open}>{candidate ? 'Replay' : 'Summary'}</Link>
              </Button>
            )
          ) : (
            <Button size="sm" variant="outline" asChild>
              <Link to={`/r/${room.slug}`}>{room.status === 'live' ? 'Rejoin' : 'Open'}</Link>
            </Button>
          )}
          {(!candidate || open) && (
            <Menu>
              <MenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label={`More for ${room.title}`}>
                  <MoreHorizontal />
                </Button>
              </MenuTrigger>
              <MenuContent align="end">
                {ended && (
                  <>
                    {!candidate && (
                      <MenuItem onSelect={() => navigate(`/sessions/${room.id}`)}>
                        <FileText /> Session summary
                      </MenuItem>
                    )}
                    {replay && (
                      <MenuItem onSelect={() => navigate(`/rooms/${room.id}/replay`)}>
                        <History /> Watch replay
                      </MenuItem>
                    )}
                  </>
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
          )}
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
      </td>
    </tr>
  );
}

/** A score out of 100 as a number with a small bar. */
export function ScoreBar({ score }: { score: number }) {
  const tone = score >= 80 ? 'bg-success' : score >= 50 ? 'bg-warning' : 'bg-destructive';
  return (
    <span className="flex items-center gap-2" title={`Test score ${score} out of 100`}>
      <span className="w-8 text-right font-medium tabular-nums">{score}</span>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <span className={cn('block h-full rounded-full', tone)} style={{ width: `${score}%` }} />
      </span>
    </span>
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
