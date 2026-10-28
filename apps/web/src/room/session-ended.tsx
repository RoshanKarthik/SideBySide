import type { ClaimTokenResponse } from '@sidebyside/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookmarkCheck, Flag, Sparkles } from 'lucide-react';
import { Link } from '@/lib/navigation';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/card';
import { api } from '@/lib/api';
import { getGuestToken, setClaimToken } from '@/lib/guest-tokens';
import { useReports } from '@/reports/ai-reports';
import { RateYourPartner } from './room-extras';

/*
 * The screen after a session ends, loaded only then: links for interviewers, and for candidates
 * their feedback and the option to save the session to an account.
 */

export default function SessionEnded({
  title,
  roomId,
  interviewer,
  practice,
  slug,
}: {
  title: string;
  roomId: string;
  interviewer: boolean;
  practice: boolean;
  slug: string;
}) {
  return (
    <div className="relative isolate flex h-full flex-col items-center justify-center overflow-y-auto px-4 py-10 text-center">
      <div className="bg-dots mask-radial absolute inset-0 -z-10 opacity-60" />
      <div className="absolute top-1/3 left-1/2 -z-10 h-72 w-[560px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)] blur-2xl" />
      <div className="flex size-12 animate-fade-up items-center justify-center rounded-2xl border bg-card shadow-lg">
        <Flag className="size-5 text-primary" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Session ended</h1>
      <p className="mt-1 text-muted-foreground">{title}</p>
      {practice && <RateYourPartner roomId={roomId} slug={slug} />}
      {interviewer ? (
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Button variant={practice ? 'outline' : 'glow'} asChild>
            <Link to={`/sessions/${roomId}`}>Open the session summary</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/rooms/${roomId}/replay`}>Watch the replay</Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            Thanks for joining — you can close this tab now.
          </p>
          <FeedbackPrompt roomId={roomId} slug={slug} />
          {getGuestToken(slug) && <ClaimPrompt roomId={roomId} slug={slug} />}
        </>
      )}
    </div>
  );
}

/** Candidates: a link to their AI feedback, when the interviewer shared it. */
function FeedbackPrompt({ roomId, slug }: { roomId: string; slug: string }) {
  const reports = useReports(roomId, 1, slug);
  const report = reports.data?.candidate;
  if (!reports.data?.enabled || !report) return null;
  return (
    <div className="mt-8 w-full max-w-md animate-fade-up rounded-2xl border bg-card p-5 text-left shadow-lg">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Your feedback</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {report.status === 'pending'
              ? 'The interviewer shared written feedback with you. It’s being written now…'
              : 'The interviewer shared written feedback on this session with you.'}
          </p>
          <Button
            size="sm"
            className="mt-3"
            disabled={report.status === 'pending'}
            asChild={report.status !== 'pending'}
          >
            {report.status === 'pending' ? (
              <span>
                <Spinner /> Writing…
              </span>
            ) : (
              <Link to={`/r/${slug}/feedback`}>Read your feedback</Link>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Guest candidates can save the session to an account when the interviewer shared its replay
 * or feedback with them. The server decides; when there is nothing to claim this shows nothing.
 */
function ClaimPrompt({ roomId, slug }: { roomId: string; slug: string }) {
  const claim = useQuery({
    queryKey: ['claim-token', roomId],
    queryFn: async () => {
      const { claimToken } = await api.json<ClaimTokenResponse>(`/rooms/${roomId}/claim-token`, {
        method: 'POST',
        roomKey: slug,
      });
      setClaimToken(roomId, claimToken);
      return claimToken;
    },
    retry: false,
    staleTime: Infinity,
  });
  if (!claim.isSuccess) return null;
  return (
    <div className="mt-8 w-full max-w-md animate-fade-up rounded-2xl border bg-card p-5 text-left shadow-lg">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BookmarkCheck className="size-4" />
        </span>
        <div>
          <p className="font-medium">Keep your feedback</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The interviewer shared this session’s replay or feedback with you. Save it to a free
            account to come back to it later.
          </p>
        </div>
      </div>
      <Button className="mt-4 w-full" asChild>
        <Link to={`/claim/${roomId}`}>
          Save to an account <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}
