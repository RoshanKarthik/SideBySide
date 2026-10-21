import type { ReplayManifest } from '@sidebyside/shared';
import { decodeReplayLog } from '@sidebyside/shared/replay';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router';
import { AppShell } from '@/components/layout';
import { ErrorNote, Spinner } from '@/components/ui/card';
import { api } from '@/lib/api';
import { ReplayPlayer } from '@/replay/replay-player';

/** `/rooms/:id/replay?round=` */
export default function ReplayPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const round = Number(params.get('round') ?? 1) || 1;
  const manifest = useQuery({
    queryKey: ['replay-manifest', id, round],
    queryFn: () => api.json<ReplayManifest>(`/rooms/${id}/replay/manifest?round=${round}`),
  });
  const log = useQuery({
    queryKey: ['replay-log', id, round],
    queryFn: async () => decodeReplayLog(await api.bytes(`/rooms/${id}/replay/log?round=${round}`)),
    enabled: manifest.isSuccess,
    staleTime: Infinity,
  });

  if (manifest.error || log.error) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md px-4 py-16">
          <ErrorNote>{(manifest.error ?? log.error)?.message}</ErrorNote>
        </div>
      </AppShell>
    );
  }
  if (!manifest.data || !log.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <Spinner className="size-5 text-primary" /> Loading the replay…
      </div>
    );
  }
  return (
    <ReplayPlayer
      key={round}
      manifest={manifest.data}
      log={log.data}
      onRound={(r) => setParams(r === 1 ? {} : { round: String(r) })}
    />
  );
}
