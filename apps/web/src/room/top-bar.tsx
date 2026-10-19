import { useEffect, useState } from 'react';
import { cn, formatClock, initials } from '@/lib/utils';
import type { ConnectionStatus, Peer } from './use-room';

const STATUS: Record<ConnectionStatus, { label: string; dot: string }> = {
  connected: { label: 'Connected', dot: 'bg-success' },
  connecting: { label: 'Connecting…', dot: 'bg-warning animate-pulse' },
  reconnecting: { label: 'Reconnecting…', dot: 'bg-warning animate-pulse' },
  offline: { label: 'Offline — edits will sync when you’re back', dot: 'bg-destructive' },
};

export function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const { label, dot } = STATUS[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      <span className={cn('size-2 rounded-full', dot)} />
      <span className={cn(status === 'connected' && 'sr-only sm:not-sr-only')}>{label}</span>
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
    <span className="font-mono text-sm tabular-nums text-muted-foreground" title="Session time">
      {formatClock(now - startedAt)}
    </span>
  );
}

export function PresenceAvatars({ peers, selfClientId }: { peers: Peer[]; selfClientId: number }) {
  // One avatar per participant, even if they have the room open in two tabs.
  const unique = new Map<string, Peer>();
  for (const p of peers) {
    const existing = unique.get(p.state.user.participantId);
    if (!existing || p.clientId === selfClientId) unique.set(p.state.user.participantId, p);
  }
  return (
    <ul className="flex -space-x-2" aria-label="People in the room">
      {[...unique.values()].map((p) => (
        <li
          key={p.state.user.participantId}
          title={`${p.state.user.name}${p.clientId === selfClientId ? ' (you)' : ''} · ${p.state.tab}`}
          className="flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-background"
          style={{ background: p.state.user.color }}
        >
          {initials(p.state.user.name)}
        </li>
      ))}
    </ul>
  );
}
