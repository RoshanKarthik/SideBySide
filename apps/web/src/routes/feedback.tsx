import type { CandidateReport, JoinRoomResponse } from '@sidebyside/shared';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useParams } from 'react-router';
import { BrandMark, brandStyle } from '@/components/brand';
import { ThemeToggle } from '@/components/logo';
import { Card, ErrorNote, Spinner } from '@/components/ui/card';
import { api } from '@/lib/api';
import { CandidateReportView, ReportBody, useReports } from '@/reports/ai-reports';

/**
 * `/r/:slug/feedback` — the candidate's AI feedback for a session, when the interviewer shared
 * it. Guests open it with the room token their browser kept from joining.
 */
export default function FeedbackPage() {
  const { slug = '' } = useParams();
  const me = useQuery({
    queryKey: ['room-me', slug],
    queryFn: () => api.json<JoinRoomResponse>(`/rooms/${slug}/me`, { roomKey: slug }),
    retry: false,
  });
  const reports = useReports(me.data?.room.id, me.data?.room.currentRound ?? 1, slug);
  const brand = me.data?.brand ?? null;

  return (
    <div className="flex min-h-full flex-col bg-background" style={brandStyle(brand)}>
      <header className="flex h-14 items-center gap-3 border-b bg-card px-4 sm:px-6">
        <BrandMark brand={brand} />
        <span className="ml-auto" />
        <ThemeToggle />
      </header>
      <main className="page-enter mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-primary">
            <Sparkles className="size-4" /> Your feedback
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">
            {me.data?.room.title ?? 'Interview feedback'}
          </h1>
          <div className="mt-8">
            {me.isPending || reports.isPending ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> Loading…
              </p>
            ) : me.error ? (
              <ErrorNote>
                This link only works in the browser you joined the interview from.
              </ErrorNote>
            ) : !reports.data?.enabled || !reports.data.candidate ? (
              <Card className="p-6 text-sm text-muted-foreground">
                There is no feedback to show for this session. The interviewer may not have shared
                it.
              </Card>
            ) : (
              <Card className="p-6">
                <ReportBody<CandidateReport>
                  report={reports.data.candidate}
                  render={(content) => <CandidateReportView report={content} />}
                />
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
