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
  Flag,
  History,
  Lock,
  ShieldCheck,
  UserPlus,
  Video,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { Lobby } from '@/call/lobby';
import { useLocalMedia } from '@/call/local-media';
import { BrandMark, brandStyle } from '@/components/brand';
import { AuthLayout } from '@/components/marketing/auth-layout';
import { Button } from '@/components/ui/button';
import { Badge, ErrorNote, Spinner } from '@/components/ui/card';
import { Checkbox, Field, Input, Label } from '@/components/ui/form';
import { Avatar } from '@/components/ui/overlay';
import { ApiRequestError, api } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { setGuestToken } from '@/lib/guest-tokens';
import { useMe } from '@/lib/use-me';
import { RoomView } from '@/room/room-view';
import { NotFoundPage } from './not-found';

/** `/r/:slug` — the join page, then the lobby, then the room itself. */
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
  const room = publicInfo.data;
  if (invite && !(membership.data && isInterviewerRole(membership.data.participant.role))) {
    if (room.status === 'ended') return <EndedNotice room={room} />;
    return <CoInterviewerInvite slug={slug} token={invite} room={room} />;
  }
  if (membership.data) return <EnterRoom slug={slug} membership={membership.data} />;
  if (room.status === 'ended') return <EndedNotice room={room} />;
  return <JoinForm slug={slug} room={room} />;
}

/**
 * The lobby (camera and microphone check), then the room. The camera and microphone live
 * here so the room keeps them when a practice round swaps and the room reopens.
 */
function EnterRoom({ slug, membership }: { slug: string; membership: JoinRoomResponse }) {
  const me = useMe();
  const lowBandwidth = me.data?.lowBandwidth ?? false;
  const media = useLocalMedia({ lowBandwidth });
  const [entered, setEntered] = useState<{ withCall: boolean } | null>(null);
  const { room, participant, brand } = membership;

  if (room.status === 'ended') {
    return <RoomView key={room.currentRound} slug={slug} membership={membership} media={media} />;
  }
  if (!entered) {
    return (
      <div className="h-full" style={brandStyle(brand)}>
        <Lobby
          title={room.title}
          brand={brand}
          name={participant.displayName}
          participantId={participant.id}
          role={participant.role}
          media={media}
          lowBandwidth={lowBandwidth}
          onJoin={(withCall) => setEntered({ withCall })}
        />
      </div>
    );
  }
  return (
    // A practice room reopens fresh when the peers swap roles for the next round.
    <RoomView
      key={room.currentRound}
      slug={slug}
      membership={membership}
      media={media}
      startInCall={entered.withCall}
    />
  );
}

function EndedNotice({ room }: { room: PublicRoom }) {
  return (
    <div
      className="relative isolate flex min-h-full flex-col items-center justify-center overflow-hidden bg-background px-6 text-center"
      style={brandStyle(room.brand)}
    >
      <div className="bg-dots mask-radial absolute inset-0 -z-10 opacity-60" />
      <BrandMark brand={room.brand} className="absolute top-5 left-6" />
      <div className="flex size-12 items-center justify-center rounded-2xl border bg-card shadow-card">
        <Flag className="size-5 text-primary" />
      </div>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{room.title}</h1>
      <p className="mt-3 text-muted-foreground">This session has ended. Thanks for joining.</p>
    </div>
  );
}

/** The right-hand panel: who's inviting you, and exactly what the room records. */
function RoomAside({ room, children }: { room: PublicRoom; children?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border bg-card p-6 shadow-raised">
        <div className="flex items-center gap-3">
          <Avatar name={room.ownerName} size={40} />
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Hosted by</p>
            <p className="truncate font-medium">
              {room.ownerName}
              {room.brand?.companyName && (
                <span className="text-muted-foreground"> · {room.brand.companyName}</span>
              )}
            </p>
          </div>
          <Badge tone={room.status === 'live' ? 'success' : 'neutral'} className="ml-auto">
            {room.status === 'live' ? '● Live now' : 'Waiting to start'}
          </Badge>
        </div>
        <h2 className="mt-5 text-xl font-semibold tracking-tight">{room.title}</h2>
        {children}
      </div>
      <ul className="mt-6 space-y-4 rounded-2xl border bg-card p-5 text-sm shadow-card">
        {[
          { icon: Video, text: 'A video call — you can check your camera and microphone first.' },
          { icon: Code2, text: 'Shared notes, a code editor that runs code, and a whiteboard.' },
          { icon: History, text: 'Edits, code runs and tab switches are recorded for replay.' },
          { icon: Eye, text: 'You see the same activity signals the interviewer sees.' },
        ].map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3 text-foreground/85">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-3.5" />
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
    <AuthLayout
      aside={<RoomAside room={room} />}
      header={<BrandMark brand={room.brand} />}
      style={brandStyle(room.brand)}
    >
      <div className="flex size-11 items-center justify-center rounded-xl border bg-card shadow-card">
        <UserPlus className="size-5 text-primary" />
      </div>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight">Join as co-interviewer</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {room.ownerName} invited you to interview with them in <strong>{room.title}</strong>.
      </p>
      <ul className="mt-6 space-y-2.5 rounded-xl border bg-card p-4 text-sm shadow-card">
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
    <AuthLayout
      aside={<RoomAside room={room} />}
      header={<BrandMark brand={room.brand} />}
      style={brandStyle(room.brand)}
    >
      <p className="text-sm text-muted-foreground">
        {room.ownerName}
        {room.brand?.companyName ? ` from ${room.brand.companyName}` : ''} invited you to
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">{room.title}</h1>
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
        <div className="rounded-xl border bg-card p-4 text-sm shadow-card">
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
        <Button type="submit" size="lg" className="w-full" disabled={!consent || join.isPending}>
          {join.isPending ? <Spinner /> : null}
          Continue
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
