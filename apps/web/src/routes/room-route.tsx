import {
  CONSENT_NOTICE,
  isInterviewerRole,
  type JoinRoomResponse,
  type PublicRoom,
} from '@sidebyside/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { AppShell } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Spinner } from '@/components/ui/card';
import { Checkbox, Input, Label } from '@/components/ui/form';
import { ApiRequestError, api } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { setGuestToken } from '@/lib/guest-tokens';
import { RoomView } from '@/room/room-view';
import { NotFoundPage } from './not-found';

/** `/r/:slug` — the join page, or the room itself once the visitor is a participant. */
export default function RoomRoute() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const invite = params.get('invite');
  const publicInfo = useQuery({
    queryKey: ['room-public', slug],
    queryFn: () => api.json<PublicRoom>(`/rooms/${slug}/public`),
  });
  const membership = useQuery({
    queryKey: ['room-me', slug],
    queryFn: async () => {
      try {
        return await api.json<JoinRoomResponse>(`/rooms/${slug}/me`, { roomKey: slug });
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) return null;
        throw err;
      }
    },
  });

  if (publicInfo.isPending || membership.isPending) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Spinner />
      </div>
    );
  }
  if (publicInfo.error) return <NotFoundPage message="This room link is not valid." />;
  if (invite && !(membership.data && isInterviewerRole(membership.data.participant.role))) {
    if (publicInfo.data.status === 'ended') return <EndedNotice title={publicInfo.data.title} />;
    return <CoInterviewerInvite slug={slug} token={invite} room={publicInfo.data} />;
  }
  if (membership.data) return <RoomView slug={slug} membership={membership.data} />;
  if (publicInfo.data.status === 'ended') return <EndedNotice title={publicInfo.data.title} />;
  return <JoinForm slug={slug} room={publicInfo.data} />;
}

function EndedNotice({ title }: { title: string }) {
  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-muted-foreground">This session has ended.</p>
      </div>
    </AppShell>
  );
}

/** `/r/:slug?invite=…` — a colleague joining the interviewer side of the room. */
function CoInterviewerInvite({
  slug,
  token,
  room,
}: {
  slug: string;
  token: string;
  room: PublicRoom;
}) {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accept = useMutation({
    mutationFn: () =>
      api.json<JoinRoomResponse>(`/rooms/${slug}/co-interviewer`, {
        method: 'POST',
        body: { token },
      }),
    onSuccess: (res) => {
      queryClient.setQueryData(['room-me', slug], res);
      navigate(`/r/${slug}`, { replace: true });
    },
  });

  if (isPending) return null;
  if (!session) {
    const next = `/r/${slug}?invite=${encodeURIComponent(token)}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-16">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">
            {room.ownerName} invited you to interview with them in
          </p>
          <h1 className="mt-1 text-xl font-semibold">{room.title}</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            As a co-interviewer you see the private panel: questions, hidden tests, private notes
            and the rubric. You join as {session.user.name}.
          </p>
          {accept.error && (
            <div className="mt-4">
              <ErrorNote>{accept.error.message}</ErrorNote>
            </div>
          )}
          <Button
            className="mt-6 w-full"
            disabled={accept.isPending}
            onClick={() => accept.mutate()}
          >
            {accept.isPending && <Spinner />}
            Join as co-interviewer
          </Button>
        </Card>
      </div>
    </AppShell>
  );
}

function JoinForm({ slug, room }: { slug: string; room: PublicRoom }) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [consent, setConsent] = useState(false);
  const join = useMutation({
    mutationFn: (displayName: string | undefined) =>
      api.json<JoinRoomResponse>(`/rooms/${slug}/join`, {
        method: 'POST',
        body: { displayName, consent: true },
        roomKey: slug,
      }),
    onSuccess: (res) => {
      if (res.collabToken) setGuestToken(slug, res.collabToken);
      queryClient.setQueryData(['room-me', slug], res);
    },
  });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = new FormData(e.currentTarget).get('name');
    join.mutate(typeof name === 'string' && name.trim() ? name.trim() : undefined);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-16">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">{room.ownerName} invited you to</p>
          <h1 className="mt-1 text-xl font-semibold">{room.title}</h1>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                name="name"
                required={!session}
                maxLength={60}
                autoComplete="name"
                defaultValue={session?.user.name ?? ''}
                autoFocus
              />
            </div>
            <div className="rounded-md bg-muted p-3 text-sm">
              <p>{CONSENT_NOTICE}</p>
              <p className="mt-2 text-muted-foreground">
                The interviewer can replay the session afterwards. See the{' '}
                <Link to="/privacy" className="underline" target="_blank">
                  privacy notice
                </Link>
                .
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Checkbox
                  id="consent"
                  checked={consent}
                  onCheckedChange={(v) => setConsent(v === true)}
                />
                <Label htmlFor="consent" className="font-normal">
                  I understand and agree
                </Label>
              </div>
            </div>
            {join.error && <ErrorNote>{join.error.message}</ErrorNote>}
            <Button type="submit" className="w-full" disabled={!consent || join.isPending}>
              {join.isPending && <Spinner />}
              Join
            </Button>
          </form>
        </Card>
        {!session && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Interviewer?{' '}
            <Link to={`/login?next=/r/${slug}`} className="underline">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </AppShell>
  );
}
