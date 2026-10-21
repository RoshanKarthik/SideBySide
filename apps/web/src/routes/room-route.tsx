import {
  CONSENT_NOTICE,
  isInterviewerRole,
  type JoinRoomResponse,
  type PublicRoom,
} from '@sidebyside/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Code2,
  Eye,
  EyeOff,
  Flag,
  History,
  Lock,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { MarketingShell } from '@/components/layout';
import { AuthLayout } from '@/components/marketing/auth-layout';
import { Button } from '@/components/ui/button';
import { Badge, ErrorNote, Spinner } from '@/components/ui/card';
import { Checkbox, Field, Input, Label } from '@/components/ui/form';
import { Avatar } from '@/components/ui/overlay';
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
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <Spinner className="size-5 text-primary" />
        Opening the room…
      </div>
    );
  }
  if (publicInfo.error) return <NotFoundPage message="This room link is not valid." />;
  if (invite && !(membership.data && isInterviewerRole(membership.data.participant.role))) {
    if (publicInfo.data.status === 'ended') return <EndedNotice title={publicInfo.data.title} />;
    return <CoInterviewerInvite slug={slug} token={invite} room={publicInfo.data} />;
  }
  if (membership.data) {
    // A practice room reopens fresh when the peers swap roles for the next round.
    return (
      <RoomView key={membership.data.room.currentRound} slug={slug} membership={membership.data} />
    );
  }
  if (publicInfo.data.status === 'ended') return <EndedNotice title={publicInfo.data.title} />;
  return <JoinForm slug={slug} room={publicInfo.data} />;
}

function EndedNotice({ title }: { title: string }) {
  return (
    <MarketingShell bare>
      <div className="relative isolate mx-auto flex max-w-md flex-col items-center px-4 py-28 text-center">
        <div className="bg-dots mask-radial absolute inset-0 -z-10 opacity-60" />
        <div className="flex size-12 items-center justify-center rounded-2xl border bg-card">
          <Flag className="size-5 text-primary" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-muted-foreground">This session has ended. Thanks for joining.</p>
      </div>
    </MarketingShell>
  );
}

/** The right-hand panel: who's inviting you, and exactly what the room records. */
function RoomAside({ room, children }: { room: PublicRoom; children?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/30 backdrop-blur">
        <div className="flex items-center gap-3">
          <Avatar name={room.ownerName} size={40} />
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Hosted by</p>
            <p className="truncate font-medium">{room.ownerName}</p>
          </div>
          <Badge tone={room.status === 'live' ? 'success' : 'neutral'} className="ml-auto">
            {room.status === 'live' ? '● Live now' : 'Waiting to start'}
          </Badge>
        </div>
        <h2 className="mt-5 text-xl font-semibold tracking-tight">{room.title}</h2>
        {children}
      </div>
      <ul className="mt-8 space-y-4 text-sm">
        {[
          { icon: Code2, text: 'Shared notes, a code editor that runs code, and a whiteboard.' },
          { icon: History, text: 'Edits, code runs and tab switches are recorded for replay.' },
          { icon: Eye, text: 'You see the same activity signals the interviewer sees.' },
          { icon: EyeOff, text: 'No audio, video or screen recording. IP addresses are not kept.' },
        ].map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3 text-muted-foreground">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-background">
              <Icon className="size-3.5 text-primary" />
            </span>
            <span className="pt-1">{text}</span>
          </li>
        ))}
      </ul>
    </div>
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
    <AuthLayout aside={<RoomAside room={room} />}>
      <div className="flex size-11 items-center justify-center rounded-xl border bg-card">
        <UserPlus className="size-5 text-primary" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Join as co-interviewer</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {room.ownerName} invited you to interview with them in <strong>{room.title}</strong>.
      </p>
      <ul className="mt-6 space-y-2.5 rounded-xl border bg-card/60 p-4 text-sm">
        {[
          'Questions with hidden tests and hints',
          'Private notes with timestamps, and the rubric',
          'Editor lock and session controls',
        ].map((t) => (
          <li key={t} className="flex items-center gap-2 text-muted-foreground">
            <Lock className="size-3.5 text-primary" /> {t}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">You join as {session.user.name}.</p>
      {accept.error && (
        <div className="mt-4">
          <ErrorNote>{accept.error.message}</ErrorNote>
        </div>
      )}
      <Button
        size="lg"
        className="mt-6 w-full"
        disabled={accept.isPending}
        onClick={() => accept.mutate()}
      >
        {accept.isPending ? <Spinner /> : null}
        Join as co-interviewer
        {!accept.isPending && <ArrowRight />}
      </Button>
    </AuthLayout>
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
    <AuthLayout aside={<RoomAside room={room} />}>
      <p className="text-sm text-muted-foreground">{room.ownerName} invited you to</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{room.title}</h1>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <Field label="Your name" htmlFor="name" hint="Shown to everyone in the room.">
          <Input
            id="name"
            name="name"
            required={!session}
            maxLength={60}
            autoComplete="name"
            defaultValue={session?.user.name ?? ''}
            placeholder="Asha Rao"
            autoFocus
          />
        </Field>
        <div className="rounded-xl border bg-card/60 p-4 text-sm">
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            {CONSENT_NOTICE}
          </p>
          <p className="mt-2 pl-6 text-muted-foreground">
            The interviewer can replay the session afterwards. See the{' '}
            <Link to="/privacy" className="underline underline-offset-2" target="_blank">
              privacy notice
            </Link>
            .
          </p>
          <div className="mt-4 flex items-center gap-2 pl-6">
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
        <Button
          type="submit"
          size="lg"
          variant="glow"
          className="w-full"
          disabled={!consent || join.isPending}
        >
          {join.isPending ? <Spinner /> : null}
          Join the room
          {!join.isPending && <ArrowRight />}
        </Button>
      </form>
      {!session && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Interviewer?{' '}
          <Link
            to={`/login?next=${encodeURIComponent(`/r/${slug}`)}`}
            className="font-medium text-primary"
          >
            Sign in
          </Link>
        </p>
      )}
    </AuthLayout>
  );
}
