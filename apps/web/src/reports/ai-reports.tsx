import type {
  CandidateReport,
  InterviewerReport,
  ReportView,
  SessionReports,
} from '@sidebyside/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Gauge,
  HelpCircle,
  Lightbulb,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Skeleton, Spinner } from '@/components/ui/card';
import { toast } from '@/components/ui/toaster';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/** A round's AI reports; checks back every few seconds while one is being written. */
export function useReports(roomId: string | undefined, round: number, roomKey?: string) {
  return useQuery({
    queryKey: ['reports', roomId, round],
    queryFn: () => api.json<SessionReports>(`/rooms/${roomId}/reports?round=${round}`, { roomKey }),
    enabled: !!roomId,
    refetchInterval: (q) =>
      [q.state.data?.interviewer, q.state.data?.candidate].some((r) => r?.status === 'pending')
        ? 3_000
        : false,
  });
}

const DRAFT_NOTE =
  'Written by AI from the session data. A draft to support the debrief, not a hiring decision.';

/** Session page: both reports for a round, with Regenerate. Hidden when AI is switched off. */
export function AiReports({ roomId, round }: { roomId: string; round: number }) {
  const reports = useReports(roomId, round);
  const [tab, setTab] = useState<'interviewer' | 'candidate'>('interviewer');
  const queryClient = useQueryClient();
  const regenerate = useMutation({
    mutationFn: () =>
      api.json(`/rooms/${roomId}/reports/regenerate?round=${round}`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Writing the reports again');
      void queryClient.invalidateQueries({ queryKey: ['reports', roomId, round] });
    },
    onError: (e) => toast.error(e.message),
  });

  const data = reports.data;
  if (!data?.enabled) return null;
  const showInterviewer = !!data.interviewer;
  const pending = [data.interviewer, data.candidate].some((r) => r?.status === 'pending');

  return (
    <Card className="mt-6 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" /> AI report
        </h2>
        {showInterviewer && (
          <div role="tablist" aria-label="Report" className="flex rounded-lg bg-muted p-0.5">
            {(
              [
                ['interviewer', 'For the hiring team'],
                ['candidate', 'Candidate feedback'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  'h-7 rounded-md px-3 text-[13px] font-medium text-muted-foreground',
                  tab === id && 'bg-card text-foreground shadow-sm',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {data.canRegenerate && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={pending || regenerate.isPending}
            onClick={() => regenerate.mutate()}
          >
            {regenerate.isPending ? <Spinner /> : <RefreshCw />} Regenerate
          </Button>
        )}
      </div>
      <div className="p-5">
        {tab === 'interviewer' && data.interviewer ? (
          <ReportBody<InterviewerReport>
            report={data.interviewer}
            render={(content) => <InterviewerReportView report={content} />}
          />
        ) : (
          <ReportBody<CandidateReport>
            report={data.candidate}
            render={(content) => <CandidateReportView report={content} />}
          />
        )}
      </div>
    </Card>
  );
}

/** The states every report goes through: being written, ready, or failed. */
export function ReportBody<T>({
  report,
  render,
}: {
  report: ReportView<T> | null;
  render: (content: T) => ReactNode;
}) {
  if (!report) {
    return (
      <p className="text-sm text-muted-foreground">
        No report for this round. Reports are written when a session ends.
      </p>
    );
  }
  if (report.status === 'pending') {
    return (
      <div role="status" aria-live="polite" className="space-y-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-3.5" /> Writing the report — usually under a minute…
        </p>
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  if (report.status === 'failed' || !report.content) {
    return (
      <ErrorNote>
        The report could not be written{report.error ? `: ${report.error}` : '.'} Try Regenerate.
      </ErrorNote>
    );
  }
  return (
    <div className="space-y-5">
      <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground/80">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
        {DRAFT_NOTE}
      </p>
      {render(report.content)}
      {report.generatedAt && (
        <p className="text-xs text-muted-foreground">
          Written {new Date(report.generatedAt).toLocaleString()}
          {report.model ? ` · ${report.model}` : ''}
        </p>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: typeof Sparkles;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5 text-primary" /> {title}
      </h3>
      <div className="mt-1.5 text-sm leading-relaxed whitespace-pre-line">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-muted-foreground">Nothing noted.</p>;
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function InterviewerReportView({ report }: { report: InterviewerReport }) {
  return (
    <div className="space-y-5">
      <p className="text-[15px] leading-relaxed">{report.summary}</p>
      <div className="grid gap-5 md:grid-cols-2">
        <Section icon={Target} title="Approach">
          {report.approach}
        </Section>
        <Section icon={CheckCircle2} title="Correctness">
          {report.correctness}
        </Section>
        <Section icon={Gauge} title="Complexity">
          {report.complexity}
        </Section>
        <Section icon={ListChecks} title="Code quality">
          {report.codeQuality}
        </Section>
        <Section icon={Lightbulb} title="Hints">
          {report.hintsUsage}
        </Section>
        <Section icon={ShieldCheck} title="Activity signals">
          {report.integrity}
        </Section>
      </div>
      {report.suggestedScores.length > 0 && (
        <Section icon={TrendingUp} title="Suggested rubric scores">
          <ul className="mt-1 divide-y rounded-lg border">
            {report.suggestedScores.map((s) => (
              <li key={s.criterion} className="flex flex-wrap items-start gap-x-4 gap-y-1 p-3">
                <span className="w-44 shrink-0 font-medium">{s.criterion}</span>
                <span className="flex items-center gap-1" aria-label={`${s.score} out of 4`}>
                  {[1, 2, 3, 4].map((n) => (
                    <span
                      key={n}
                      className={cn(
                        'h-1.5 w-5 rounded-full',
                        n <= s.score ? 'bg-primary' : 'bg-muted',
                      )}
                    />
                  ))}
                  <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                    {s.score}/4
                  </span>
                </span>
                <span className="min-w-0 basis-full text-muted-foreground">{s.reasoning}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {report.keyMoments.length > 0 && (
          <Section icon={BookOpen} title="Key moments">
            <ol className="space-y-1">
              {report.keyMoments.map((m, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-12 shrink-0 font-mono text-xs text-primary tabular-nums">
                    {m.time}
                  </span>
                  <span>{m.text}</span>
                </li>
              ))}
            </ol>
          </Section>
        )}
        <Section icon={HelpCircle} title="Questions for the debrief">
          <Bullets items={report.openQuestions} />
        </Section>
      </div>
    </div>
  );
}

export function CandidateReportView({ report }: { report: CandidateReport }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Section icon={CheckCircle2} title="What went well">
          <Bullets items={report.wentWell} />
        </Section>
        <Section icon={TrendingUp} title="What to improve">
          <Bullets items={report.toImprove} />
        </Section>
      </div>
      <Section icon={BookOpen} title="Concepts to study">
        {report.conceptsToStudy.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {report.conceptsToStudy.map((c) => (
              <li key={c} className="rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs">
                {c}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Nothing noted.</p>
        )}
      </Section>
      <Section icon={Lightbulb} title="A cleaner approach">
        {report.referenceApproach}
      </Section>
      <Section icon={Gauge} title="Complexity">
        {report.complexityNotes}
      </Section>
    </div>
  );
}
