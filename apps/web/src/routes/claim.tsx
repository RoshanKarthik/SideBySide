import type { ClaimSessionResponse } from '@sidebyside/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BookmarkCheck, CheckCircle2, History, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { AuthLayout } from '@/components/marketing/auth-layout';
import { Button } from '@/components/ui/button';
import { ErrorNote, Skeleton, Spinner } from '@/components/ui/card';
import { api } from '@/lib/api';
import { signOut, useSession } from '@/lib/auth-client';
import { clearClaimToken, getClaimToken, takeClaimTokenFromUrl } from '@/lib/guest-tokens';
import { Link } from '@/lib/navigation';

/**
 * A guest candidate saves an ended session to an account: they arrive from the "Session ended"
 * screen, sign up or sign in, then confirm which account the session goes to.
 */
export default function ClaimPage() {
  const { roomId = '' } = useParams();
  const [claimToken] = useState(() => takeClaimTokenFromUrl(roomId) ?? getClaimToken(roomId));
  const { data: session, isPending } = useSession();
  const queryClient = useQueryClient();
  const claim = useMutation({
    mutationFn: () =>
      api.json<ClaimSessionResponse>('/claim', { method: 'POST', body: { claimToken } }),
    onSuccess: () => {
      clearClaimToken(roomId);
      void queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
  const next = encodeURIComponent(`/claim/${roomId}`);

  let content;
  if (claim.isSuccess) {
    const { room } = claim.data;
    const shared = [
      room.shareReportWithCandidate && 'your feedback',
      room.shareReplayWithCandidate && 'the replay',
    ].filter(Boolean);
    content = (
      <>
        <CheckCircle2 className="size-8 text-success" />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Saved to your account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          “{room.title}” is on your dashboard now
          {shared.length ? `, with ${shared.join(' and ')}` : ''}. It stays there until the
          interviewer’s retention period ends.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          {room.shareReportWithCandidate && (
            <Button variant="glow" asChild>
              <Link to={`/r/${room.slug}/feedback`}>
                <Sparkles /> Read your feedback
              </Link>
            </Button>
          )}
          {room.shareReplayWithCandidate && (
            <Button variant={room.shareReportWithCandidate ? 'outline' : 'glow'} asChild>
              <Link to={`/rooms/${room.id}/replay`}>
                <History /> Watch the replay
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to="/dashboard">Go to your dashboard</Link>
          </Button>
        </div>
      </>
    );
  } else if (!claimToken) {
    content = (
      <>
        <h1 className="text-3xl font-semibold tracking-tight">This link can’t be used here</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Open it from the “Session ended” screen in the browser you used for the interview, or use
          the full link you copied there. If you already saved the session, it’s on your dashboard.
        </p>
        <Button className="mt-8" variant="outline" asChild>
          <Link to="/dashboard">Go to your dashboard</Link>
        </Button>
      </>
    );
  } else if (isPending) {
    content = <Skeleton className="h-40" />;
  } else if (!session) {
    content = (
      <>
        <BookmarkCheck className="size-8 text-primary" />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Keep your interview</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a free account, or sign in, to save this session and the feedback the interviewer
          shared with you.
        </p>
        <div className="mt-8 space-y-3">
          <Button size="lg" className="w-full" asChild>
            <Link to={`/login?mode=signup&next=${next}`}>
              Create an account <ArrowRight />
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="w-full" asChild>
            <Link to={`/login?next=${next}`}>I already have an account</Link>
          </Button>
        </div>
      </>
    );
  } else {
    content = (
      <>
        <BookmarkCheck className="size-8 text-primary" />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Save this session?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It will be saved to{' '}
          <span className="font-medium text-foreground">{session.user.email}</span>. The interviewer
          keeps seeing the name you joined with.
        </p>
        {claim.error && (
          <div className="mt-6">
            <ErrorNote>{claim.error.message}</ErrorNote>
          </div>
        )}
        <div className="mt-8 space-y-3">
          <Button
            size="lg"
            className="w-full"
            disabled={claim.isPending}
            onClick={() => claim.mutate()}
          >
            {claim.isPending && <Spinner />} Save to my account
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="w-full"
            onClick={async () => {
              await signOut();
              window.location.assign(`/login?next=${next}`);
            }}
          >
            Use a different account
          </Button>
        </div>
      </>
    );
  }

  return <AuthLayout>{content}</AuthLayout>;
}
