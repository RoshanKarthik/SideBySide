import { LANGUAGE_INFO, RUBRIC_SCORE_LABELS, type SessionSummary } from '@sidebyside/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AppWindow,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ClipboardPaste,
  Clock,
  EyeOff,
  FlaskConical,
  Lightbulb,
  Lock,
  PlayCircle,
  ShieldCheck,
  Terminal,
  TextCursorInput,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { Link, useNavigate } from '@/lib/navigation';
import { AppShell } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge, Card, ErrorNote, Skeleton, Spinner } from '@/components/ui/card';
import { Avatar, Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/overlay';
import { toast } from '@/components/ui/toaster';
import { api } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { cn, formatClock, formatDuration, timeAgo } from '@/lib/utils';

/** `/sessions/:id` — everything about one session, for its interviewers. */
export default function SessionPage() {
  const { id = '' } = useParams();
  const { data: auth, isPending } = useSession();
  const summary = useQuery({
    queryKey: ['session', id],
    queryFn: () => api.json<SessionSummary>(`/rooms/${id}/summary`),
    enabled: !!auth,
  });

  if (isPending) return null;
  if (!auth) return <Navigate to={`/login?next=/sessions/${id}`} replace />;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <Link
          to="/dashboard"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Dashboard
        </Link>
        {summary.isPending && (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-10 w-1/2" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-72 rounded-xl" />
          </div>
        )}
        {summary.error && (
          <div className="mt-6">
            <ErrorNote>{summary.error.message}</ErrorNote>
          </div>
        )}
        {summary.data && <SessionBody s={summary.data} />}
      </div>
    </AppShell>
  );
}

function SessionBody({ s }: { s: SessionSummary }) {
  const [roundIdx, setRoundIdx] = useState(0);
  const round = s.rounds[roundIdx] ?? s.rounds[0];
  const runs = s.rounds.reduce((n, r) => n + r.runs.total, 0);
  const okRuns = s.rounds.reduce((n, r) => n + r.runs.ok, 0);
  const tests = s.rounds.flatMap((r) => r.tests);
  // Weighted score when the run has one; older runs fall back to the share of tests passed.
  const scoreOf = (t: (typeof tests)[number]) =>
    t.score ?? Math.floor((t.passed / Math.max(1, t.total)) * 100);
  const best = tests.reduce<(typeof tests)[number] | null>(
    (b, t) => (!b || scoreOf(t) > scoreOf(b) ? t : b),
    null,
  );
  const start = Date.parse(s.room.startedAt ?? s.room.createdAt);

  return (
    <>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{s.room.title}</h1>
            <Badge tone={s.room.mode === 'practice' ? 'info' : 'neutral'}>
              {s.room.mode === 'practice' ? 'Practice' : 'Interview'}
            </Badge>
            {s.room.status === 'live' && <Badge tone="success">Live</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date(s.room.createdAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}{' '}
            · {LANGUAGE_INFO[s.room.defaultLanguage].label} · Recording kept {s.room.retentionDays}{' '}
            days
          </p>
        </div>
        <div className="flex gap-2">
          {s.canViewReplay && (
            <Button variant="glow" asChild>
              <Link
                to={`/rooms/${s.room.id}/replay${round && round.roundNumber > 1 ? `?round=${round.roundNumber}` : ''}`}
              >
                <PlayCircle /> Watch replay
              </Link>
            </Button>
          )}
          {s.room.status !== 'ended' && (
            <Button asChild>
              <Link to={`/r/${s.room.slug}`}>Open room</Link>
            </Button>
          )}
          {s.canDelete && s.room.status !== 'live' && (
            <DeleteSession roomId={s.room.id} title={s.room.title} />
          )}
        </div>
      </div>

      <div className="stagger mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          icon={Clock}
          label="Duration"
          value={s.durationMs ? formatDuration(s.durationMs) : '—'}
        />
        <Metric icon={Users} label="People" value={String(s.participants.length)} />
        <Metric
          icon={Terminal}
          label="Code runs"
          value={String(runs)}
          hint={runs ? `${okRuns} ok · ${runs - okRuns} failed` : undefined}
        />
        <Metric
          icon={FlaskConical}
          label="Best test score"
          value={best ? `${scoreOf(best)} / 100` : '—'}
          hint={best ? `${best.passed} of ${best.total} tests passed` : undefined}
          tone={best ? (best.passed === best.total ? 'ok' : 'warn') : undefined}
        />
      </div>

      {s.rounds.length > 1 && (
        <div
          role="tablist"
          aria-label="Round"
          className="mt-8 flex w-fit rounded-lg bg-muted p-0.5"
        >
          {s.rounds.map((r, i) => (
            <button
              key={r.roundNumber}
              type="button"
              role="tab"
              aria-selected={roundIdx === i}
              onClick={() => setRoundIdx(i)}
              className={cn(
                'h-8 rounded-md px-4 text-sm font-medium text-muted-foreground',
                roundIdx === i && 'bg-background text-foreground shadow-sm',
              )}
            >
              Round {r.roundNumber} · {r.interviewer ?? '—'} interviews
            </button>
          ))}
        </div>
      )}

      {round && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <Panel title="Rubric" icon={CheckCircle2}>
              {round.rubric === null ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Lock className="size-4" /> Only {round.interviewer ?? 'the interviewer'} sees
                  this round’s rubric.
                </p>
              ) : round.rubric.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No rubric scores were saved for this round.
                </p>
              ) : (
                <RubricView rubric={round.rubric} />
              )}
            </Panel>
            <Panel title="Timeline" icon={BookOpen}>
              <Timeline round={round} start={start} />
            </Panel>
          </div>
          <div className="space-y-4">
            <Panel title="People" icon={Users}>
              <ul className="space-y-3">
                {s.participants.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <Avatar name={p.displayName} id={p.id} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.displayName}</p>
                      <p className="text-xs text-muted-foreground">Joined {timeAgo(p.joinedAt)}</p>
                    </div>
                    <Badge>{p.role}</Badge>
                    {p.isGuest && <Badge tone="info">guest</Badge>}
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Activity signals" icon={ShieldCheck}>
              <Signals signals={round.signals} />
              <p className="mt-3 text-xs text-muted-foreground">
                Everyone in the room saw these while it happened. They show what happened, not why.
              </p>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  hint?: string;
  tone?: 'ok' | 'warn';
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        {label}
        <Icon className="size-4" />
      </div>
      <p
        className={cn(
          'mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums',
          tone === 'ok' && 'text-success',
          tone === 'warn' && 'text-warning',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Clock;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-primary" /> {title}
      </h2>
      {children}
    </Card>
  );
}

function RubricView({
  rubric,
}: {
  rubric: NonNullable<SessionSummary['rounds'][number]['rubric']>;
}) {
  const scored = rubric.filter((r) => r.score !== null);
  const avg = scored.length ? scored.reduce((s, r) => s + r.score!, 0) / scored.length : null;
  return (
    <>
      {avg !== null && (
        <div className="mb-4 flex items-baseline gap-2">
          <span className="font-mono text-3xl font-semibold tabular-nums">{avg.toFixed(1)}</span>
          <span className="text-sm text-muted-foreground">
            / 4 average over {scored.length} criteria
          </span>
        </div>
      )}
      <ul className="space-y-3">
        {rubric.map((r) => (
          <li key={r.criterion}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">{r.criterion}</span>
              <span className="flex items-center gap-2">
                <span
                  className="flex gap-1"
                  aria-label={r.score ? `${r.score} of 4` : 'Not scored'}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <span
                      key={n}
                      className={cn(
                        'h-2 w-6 rounded-full',
                        r.score !== null && n <= r.score ? 'bg-brand-gradient' : 'bg-muted',
                      )}
                    />
                  ))}
                </span>
                <span className="w-12 text-right text-xs text-muted-foreground">
                  {r.score ? RUBRIC_SCORE_LABELS[r.score] : '—'}
                </span>
              </span>
            </div>
            {r.comment && <p className="mt-1 text-xs text-muted-foreground">{r.comment}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}

function Timeline({ round, start }: { round: SessionSummary['rounds'][number]; start: number }) {
  const items = [
    ...round.questions.map((q) => ({
      ts: q.ts,
      icon: BookOpen,
      text: `Showed “${q.title}”`,
      tone: 'info',
    })),
    ...round.tests.map((t) => ({
      ts: t.ts,
      icon: t.passed === t.total ? CheckCircle2 : XCircle,
      text: `Tests in ${LANGUAGE_INFO[t.language].label}: ${t.passed} / ${t.total} passed${t.score !== null ? ` · score ${t.score}` : ''}`,
      tone: t.passed === t.total ? 'ok' : 'error',
    })),
  ].sort((a, b) => a.ts - b.ts);

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <Badge>
          <Terminal className="size-3" /> {round.runs.total} run{round.runs.total === 1 ? '' : 's'}
        </Badge>
        <Badge>
          <Lightbulb className="size-3" /> {round.hintsRevealed} hint
          {round.hintsRevealed === 1 ? '' : 's'} revealed
        </Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No questions were shown in this round.</p>
      ) : (
        <ol className="relative space-y-4 border-l pl-5">
          {items.map((it, i) => (
            <li key={i} className="relative">
              <span
                className={cn(
                  'absolute top-1 -left-[25px] flex size-2.5 rounded-full ring-4 ring-card',
                  it.tone === 'ok'
                    ? 'bg-success'
                    : it.tone === 'error'
                      ? 'bg-destructive'
                      : 'bg-primary',
                )}
              />
              <p className="flex items-center gap-2 text-sm">
                <it.icon className="size-3.5 text-muted-foreground" /> {it.text}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {formatClock(it.ts - start)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function Signals({ signals }: { signals: SessionSummary['rounds'][number]['signals'] }) {
  const rows = [
    {
      icon: ClipboardPaste,
      label: 'Pastes',
      value: signals.pastes,
      detail: signals.pastes ? `${signals.pastedChars.toLocaleString()} characters` : '',
    },
    { icon: TextCursorInput, label: 'Large inserts', value: signals.largeInserts, detail: '' },
    {
      icon: EyeOff,
      label: 'Tab hidden',
      value: signals.tabHidden,
      detail: signals.hiddenMs ? formatDuration(signals.hiddenMs) : '',
    },
    {
      icon: AppWindow,
      label: 'Left the window',
      value: signals.windowBlur,
      detail: signals.awayMs ? formatDuration(signals.awayMs) : '',
    },
  ];
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <r.icon className={cn('size-4', r.value ? 'text-warning' : 'text-muted-foreground')} />
          <span className="flex-1 text-sm">{r.label}</span>
          {r.detail && <span className="text-xs text-muted-foreground">{r.detail}</span>}
          <span className="w-8 text-right font-mono text-sm font-semibold tabular-nums">
            {r.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DeleteSession({ roomId, title }: { roomId: string; title: string }) {
  const navigate = useNavigate();
  const remove = useMutation({
    mutationFn: () => api.send(`/rooms/${roomId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Session deleted');
      navigate('/dashboard', { replace: true });
    },
  });
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Trash2 /> Delete
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Delete this session?"
        description={`“${title}” and its replay, notes, code runs and rubric will be deleted for everyone. This can’t be undone.`}
      >
        {remove.error && (
          <div className="mt-4">
            <ErrorNote>{remove.error.message}</ErrorNote>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending && <Spinner />} Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
