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
import { BookOpen, Check, Copy, Plus, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { AppShell } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge, Card, ErrorNote, Spinner } from '@/components/ui/card';
import { Checkbox, Input, Label, NativeSelect } from '@/components/ui/form';
import { api } from '@/lib/api';
import { useSession } from '@/lib/auth-client';

export function DashboardPage() {
  const { data: session, isPending } = useSession();
  const rooms = useQuery({
    queryKey: ['rooms'],
    queryFn: () => api.json<RoomListItem[]>('/rooms'),
    enabled: !!session,
  });

  if (isPending) return null;
  if (!session) return <Navigate to="/login?next=/dashboard" replace />;

  const groups = [
    { title: 'Live', items: rooms.data?.filter((r) => r.status === 'live') ?? [] },
    { title: 'Upcoming', items: rooms.data?.filter((r) => r.status === 'scheduled') ?? [] },
    { title: 'Ended', items: rooms.data?.filter((r) => r.status === 'ended') ?? [] },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Your rooms</h1>
            <p className="text-sm text-muted-foreground">Create a room and send the link.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/questions">
                <BookOpen /> Question bank
              </Link>
            </Button>
            <NewRoomDialog />
          </div>
        </div>
        {rooms.isPending && <Spinner className="mt-10" />}
        {rooms.error && <ErrorNote>{rooms.error.message}</ErrorNote>}
        {rooms.data && rooms.data.length === 0 && (
          <Card className="mt-8 p-8 text-center text-muted-foreground">
            No rooms yet. Create one to start an interview.
          </Card>
        )}
        {groups.map(
          (g) =>
            g.items.length > 0 && (
              <section key={g.title} className="mt-8">
                <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {g.title}
                </h2>
                <div className="grid gap-3">
                  {g.items.map((room) => (
                    <RoomRow key={room.id} room={room} />
                  ))}
                </div>
              </section>
            ),
        )}
      </div>
    </AppShell>
  );
}

function RoomRow({ room }: { room: RoomListItem }) {
  const when = new Date(room.endedAt ?? room.startedAt ?? room.createdAt);
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{room.title}</span>
          {room.status === 'live' && <Badge tone="live">● Live</Badge>}
          {room.myRole !== 'owner' && <Badge>{room.myRole}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          {LANGUAGE_INFO[room.defaultLanguage].label} · {when.toLocaleString()}
        </p>
      </div>
      <div className="flex gap-2">
        {room.status === 'ended' ? (
          <Button size="sm" variant="outline" asChild>
            <Link to={`/rooms/${room.id}/replay`}>Replay</Link>
          </Button>
        ) : (
          <>
            <CopyLinkButton link={`${window.location.origin}/r/${room.slug}`} />
            <Button size="sm" asChild>
              <Link to={`/r/${room.slug}`}>Open</Link>
            </Button>
          </>
        )}
      </div>
    </Card>
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
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  );
}

function NewRoomDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
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
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setCreated(null);
          create.reset();
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button>
          <Plus /> New room
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-6 shadow-lg">
          <div className="flex items-start justify-between">
            <Dialog.Title className="text-lg font-semibold">
              {created ? 'Room ready' : 'New interview room'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Create a room and share its link with the candidate.
          </Dialog.Description>
          {created ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Send this link to the candidate. They join with just their name.
              </p>
              <Input readOnly value={created.link} onFocus={(e) => e.currentTarget.select()} />
              <div className="flex justify-end gap-2">
                <CopyLinkButton link={created.link} />
                <Button asChild>
                  <Link to={`/r/${created.room.slug}`}>Open room</Link>
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  name="title"
                  required
                  maxLength={120}
                  placeholder="Frontend round – Asha"
                />
              </div>
              <div className="flex flex-wrap gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="language">Language</Label>
                  <NativeSelect
                    id="language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as Lang)}
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l}>
                        {LANGUAGE_INFO[l].label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="retention">Keep recording for</Label>
                  <NativeSelect
                    id="retention"
                    name="retention"
                    defaultValue={DEFAULT_RETENTION_DAYS}
                  >
                    {RETENTION_DAYS.map((d) => (
                      <option key={d} value={d}>
                        {d} days
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
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
                  Share the AI feedback report with the candidate
                </Label>
              </div>
              {create.error && <ErrorNote>{create.error.message}</ErrorNote>}
              <div className="flex justify-end">
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending && <Spinner />}
                  Create room
                </Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
