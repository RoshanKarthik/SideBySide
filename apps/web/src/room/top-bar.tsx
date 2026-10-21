import { Timer, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar, Tooltip } from '@/components/ui/overlay';
import { cn, formatClock } from '@/lib/utils';
import type { ConnectionStatus, Peer } from './use-room';

const STATUS: Record<ConnectionStatus, { label: string; tone: string }> = {
  connected: { label: 'Connected', tone: 'text-success' },
  connecting: { label: 'Connecting…', tone: 'text-warning' },
  reconnecting: { label: 'Reconnecting…', tone: 'text-warning' },
  offline: { label: 'Offline — edits will sync when you’re back', tone: 'text-destructive' },
};

export function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const { label, tone } = STATUS[status];
  const Icon = status === 'offline' ? WifiOff : Wifi;
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium',
        status !== 'connected' && 'border-warning/30 bg-warning/10',
        status === 'offline' && 'border-destructive/30 bg-destructive/10',
      )}
    >
      {status === 'connected' ? (
        <span className="size-1.5 animate-pulse-ring rounded-full bg-success" />
      ) : (
        <Icon className={cn('size-3.5', tone, status !== 'offline' && 'animate-pulse')} />
      )}
      <span
        className={cn(
          tone,
          status === 'connected' && 'sr-only sm:not-sr-only text-muted-foreground',
        )}
      >
        {label}
      </span>
    </span>
  );
}

export function SessionTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <Tooltip content="Time since the session started">
      <span className="flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-mono text-xs tabular-nums text-muted-foreground">
        <Timer className="size-3.5" />
        {formatClock(now - startedAt)}
      </span>
    </Tooltip>
  );
}

const TAB_LABEL = { discuss: 'Discuss', code: 'Code', design: 'Design' } as const;

export function PresenceAvatars({ peers, selfClientId }: { peers: Peer[]; selfClientId: number }) {
  // One avatar per participant, even if they have the room open in two tabs.
  const unique = new Map<string, Peer>();
  for (const p of peers) {
    const existing = unique.get(p.state.user.participantId);
    if (!existing || p.clientId === selfClientId) unique.set(p.state.user.participantId, p);
  }
  return (
    <ul className="flex -space-x-2" aria-label="People in the room">
      {[...unique.values()].map((p) => {
        const you = p.clientId === selfClientId;
        return (
          <li key={p.state.user.participantId}>
            <Tooltip
              content={
                <span>
                  <span className="font-medium">{p.state.user.name}</span>
                  {you && ' (you)'}
                  <span className="text-muted-foreground">
                    {' '}
                    · {p.state.user.role} · on {TAB_LABEL[p.state.tab]}
                  </span>
                </span>
              }
            >
              <span
                tabIndex={0}
                className="relative block rounded-full ring-2 ring-background"
                aria-label={`${p.state.user.name}${you ? ' (you)' : ''}`}
              >
                <Avatar name={p.state.user.name} id={p.state.user.participantId} size={28} />
                <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-success ring-2 ring-background" />
              </span>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
