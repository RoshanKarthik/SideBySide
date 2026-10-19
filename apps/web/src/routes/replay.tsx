import type { ReplayManifest } from '@sidebyside/shared';
import { decodeReplayLog } from '@sidebyside/shared/replay';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { AppShell } from '@/components/layout';
import { ErrorNote, Spinner } from '@/components/ui/card';
import { api } from '@/lib/api';
import { ReplayPlayer } from '@/replay/replay-player';

/** `/rooms/:id/replay` */
export default function ReplayPage() {
  const { id = '' } = useParams();
  const manifest = useQuery({
    queryKey: ['replay-manifest', id],
    queryFn: () => api.json<ReplayManifest>(`/rooms/${id}/replay/manifest`),
  });
  const log = useQuery({
    queryKey: ['replay-log', id],
    queryFn: async () => decodeReplayLog(await api.bytes(`/rooms/${id}/replay/log`)),
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
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner /> Loading the replay…
      </div>
    );
  }
  return <ReplayPlayer manifest={manifest.data} log={log.data} />;
}
