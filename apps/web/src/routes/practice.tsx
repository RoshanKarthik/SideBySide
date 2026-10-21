import {
  DIFFICULTIES,
  LANGUAGES,
  LANGUAGE_INFO,
  PRACTICE_GIVE_UP_HINT_MS,
  PRACTICE_TOPICS,
  type CreateRoomResponse,
  type Difficulty,
  type Lang,
  type PracticePrefs,
  type PracticeStats,
  type PracticeTopic,
  type QueueStatus,
} from '@sidebyside/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, History, Sparkles, Star, Timer, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { Link, useNavigate } from '@/lib/navigation';
import { AppShell } from '@/components/layout';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Skeleton,
  Spinner,
} from '@/components/ui/card';
import { Label, NativeSelect } from '@/components/ui/form';
import { api } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { useMe } from '@/lib/use-me';
import { cn, formatClock, timeAgo } from '@/lib/utils';

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

export default function PracticePage() {
  const { data: session, isPending } = useSession();
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ['practice-status'],
    queryFn: () => api.json<QueueStatus>('/practice/queue/status'),
    enabled: !!session,
    // Polling is also the heartbeat that keeps us in the queue.
    refetchInterval: (q) => (q.state.data?.status === 'waiting' ? 2500 : false),
  });
  const join = useMutation({
    mutationFn: (prefs: PracticePrefs) =>
      api.json<QueueStatus>('/practice/queue', { method: 'POST', body: prefs }),
    onSuccess: (s) => queryClient.setQueryData(['practice-status'], s),
  });
  const leave = useMutation({
    mutationFn: () => api.send('/practice/queue', { method: 'DELETE' }),
    onSuccess: () => queryClient.setQueryData(['practice-status'], { status: 'idle' }),
  });

  if (isPending) return null;
  if (!session) return <Navigate to="/login?next=/practice" replace />;

  const s = status.data;
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
        <PageHeader
          title="Practise with a peer"
          description="Get matched with someone at your level. You interview them for one round, then swap."
        />
        {status.isPending && <Skeleton className="mt-8 h-80 rounded-2xl" />}
        {status.error && <ErrorNote>{status.error.message}</ErrorNote>}
        {s?.status === 'matched' && <Matched slug={s.roomSlug} partner={s.partnerName} />}
        {s?.status === 'waiting' && (
          <Waiting status={s} onCancel={() => leave.mutate()} cancelling={leave.isPending} />
        )}
        {s?.status === 'idle' && (
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <PreferencesCard
              busy={join.isPending}
              error={join.error?.message}
              onStart={(p) => join.mutate(p)}
            />
            <StatsCard />
          </div>
        )}
      </div>
    </AppShell>
  );
}

function PreferencesCard({
  busy,
  error,
  onStart,
}: {
  busy: boolean;
  error?: string;
  onStart: (prefs: PracticePrefs) => void;
}) {
  const me = useMe();
  const [topic, setTopic] = useState<PracticeTopic>('mixed');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [language, setLanguage] = useState<Lang | null>(null);
  const lang = language ?? me.data?.defaultLanguage ?? 'python';

  return (
    <Card className="relative overflow-hidden p-6">
      <div className="absolute -top-20 -right-20 size-56 rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)]" />
      <h2 className="relative flex items-center gap-2 font-semibold">
        <Sparkles className="size-4 text-primary" /> What do you want to practise?
      </h2>
      <div className="relative mt-6 space-y-6">
        <div>
          <Label>Topic</Label>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Topic">
            {PRACTICE_TOPICS.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={topic === t}
                onClick={() => setTopic(t)}
                className={cn(
                  'h-8 rounded-full border px-3.5 text-sm transition-colors',
                  topic === t
                    ? 'border-primary bg-primary/12 text-foreground'
                    : 'text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                )}
              >
                {cap(t)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <div>
            <Label>Difficulty</Label>
            <div
              className="mt-2 flex rounded-lg bg-muted p-0.5"
              role="radiogroup"
              aria-label="Difficulty"
            >
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={difficulty === d}
                  onClick={() => setDifficulty(d)}
                  className={cn(
                    'h-8 rounded-md px-4 text-sm font-medium text-muted-foreground',
                    difficulty === d && 'bg-background text-foreground shadow-sm',
                  )}
                >
                  {cap(d)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="practice-language">Language</Label>
            <NativeSelect
              id="practice-language"
              className="mt-2 block h-9"
              value={lang}
              onChange={(e) => setLanguage(e.target.value as Lang)}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_INFO[l].label}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button
          variant="glow"
          size="lg"
          disabled={busy}
          onClick={() => onStart({ topic, difficulty, language: lang })}
        >
          {busy ? <Spinner /> : <Users />} Find a partner
        </Button>
        <p className="text-xs text-muted-foreground">
          If nobody with the same topic turns up in 45 seconds, we match you on difficulty and
          language only.
        </p>
      </div>
    </Card>
  );
}

function Waiting({
  status,
  onCancel,
  cancelling,
}: {
  status: Extract<QueueStatus, { status: 'waiting' }>;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const waited = now - status.enqueuedAt;
  const solo = useMutation({
    mutationFn: async () => {
      await api.send('/practice/queue', { method: 'DELETE' });
      return api.json<CreateRoomResponse>('/rooms', {
        method: 'POST',
        body: {
          title: `Solo practice · ${cap(status.prefs.topic)}`,
          defaultLanguage: status.prefs.language,
        },
      });
    },
    onSuccess: (res) => navigate(`/r/${res.room.slug}`),
  });

  return (
    <Card className="relative mt-8 flex flex-col items-center overflow-hidden px-6 py-14 text-center">
      <div className="bg-dots mask-radial absolute inset-0 opacity-50" />
      <div className="relative flex size-40 items-center justify-center">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="absolute inset-0 rounded-full border border-primary/40"
            style={{ animation: `radar 2.4s ease-out ${i * 0.8}s infinite` }}
          />
        ))}
        <span className="relative flex size-16 items-center justify-center rounded-full bg-brand-gradient shadow-[0_0_40px_-6px_var(--glow)]">
          <Users className="size-7 text-white" />
        </span>
      </div>
      <h2 className="relative mt-8 text-xl font-semibold">Looking for a partner…</h2>
      <p className="relative mt-2 text-sm text-muted-foreground">
        {cap(status.relaxed ? 'any topic' : status.prefs.topic)} · {cap(status.prefs.difficulty)} ·{' '}
        {LANGUAGE_INFO[status.prefs.language].label}
      </p>
      <div className="relative mt-4 flex items-center gap-3 text-sm">
        <Badge>
          <Timer className="size-3" /> {formatClock(waited)}
        </Badge>
        <Badge tone="info">{status.waiting} in the queue</Badge>
        {status.relaxed && <Badge tone="warning">Widened to any topic</Badge>}
      </div>
      {waited > PRACTICE_GIVE_UP_HINT_MS && (
        <div className="relative mt-8 max-w-md rounded-xl border bg-background/70 p-4 text-sm">
          <p className="font-medium">No one’s available right now.</p>
          <p className="mt-1 text-muted-foreground">
            Keep waiting, or practise on your own with a question and a timer.
          </p>
          <Button
            className="mt-3"
            size="sm"
            disabled={solo.isPending}
            onClick={() => solo.mutate()}
          >
            {solo.isPending && <Spinner />} Practise solo
          </Button>
        </div>
      )}
      <Button variant="ghost" className="relative mt-6" disabled={cancelling} onClick={onCancel}>
        <X /> Stop looking
      </Button>
      <style>{`@keyframes radar { from { transform: scale(0.45); opacity: 1 } to { transform: scale(1.25); opacity: 0 } }`}</style>
    </Card>
  );
}

function Matched({ slug, partner }: { slug: string; partner: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    const id = setTimeout(() => navigate(`/r/${slug}`), 1800);
    return () => clearTimeout(id);
  }, [navigate, slug]);
  return (
    <Card className="mt-8 flex animate-fade-up flex-col items-center px-6 py-14 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-success/15">
        <Sparkles className="size-7 text-success" />
      </span>
      <h2 className="mt-6 text-xl font-semibold">You’re matched with {partner}!</h2>
      <p className="mt-2 text-sm text-muted-foreground">Opening your practice room…</p>
      <Button className="mt-6" asChild>
        <Link to={`/r/${slug}`}>
          Go now <ArrowRight />
        </Link>
      </Button>
    </Card>
  );
}

function StatsCard() {
  const stats = useQuery({
    queryKey: ['practice-stats'],
    queryFn: () => api.json<PracticeStats>('/practice/stats'),
  });
  if (stats.isPending) return <Skeleton className="h-80 rounded-xl" />;
  if (stats.error) return <ErrorNote>{stats.error.message}</ErrorNote>;
  const { averages, history } = stats.data;
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Star className="size-4 text-warning" /> How partners rate you
        </h2>
        {averages ? (
          <dl className="mt-4 grid grid-cols-3 gap-3">
            {(
              [
                ['Problem solving', averages.problemSolving],
                ['Communication', averages.communication],
                ['Interviewing', averages.interviewing],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="rounded-lg border bg-background/50 p-3">
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
                <dd className="mt-1 font-mono text-xl font-semibold tabular-nums">
                  {v.toFixed(1)}
                  <span className="text-xs text-muted-foreground"> / 5</span>
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Ratings appear here after partners rate you. Only you can see them.
          </p>
        )}
        {averages && (
          <p className="mt-3 text-xs text-muted-foreground">
            From {averages.count} rating{averages.count === 1 ? '' : 's'}. Only you can see this.
          </p>
        )}
      </Card>
      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <History className="size-4 text-primary" /> Recent sessions
        </h2>
        {history.length === 0 ? (
          <EmptyState icon={Users} title="No practice yet" className="mt-4 py-8">
            Your practice sessions show up here.
          </EmptyState>
        ) : (
          <ul className="mt-3 divide-y">
            {history.slice(0, 8).map((h) => (
              <li key={h.roomId} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <Link
                    to={h.status === 'ended' ? `/sessions/${h.roomId}` : `/r/${h.slug}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {h.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    with {h.partnerName} · {timeAgo(h.createdAt)}
                  </p>
                </div>
                {h.status === 'ended' && !h.rated && (
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/r/${h.slug}`}>Rate</Link>
                  </Button>
                )}
                {h.status !== 'ended' && <Badge tone="success">Live</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
