import { isIntegrityEvent, type RoomEvent } from '@sidebyside/shared';
import { useQuery } from '@tanstack/react-query';
import {
  AppWindow,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  EyeOff,
  ShieldCheck,
  TextCursorInput,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { cn, formatClock } from '@/lib/utils';
import type { RoomConnection } from './use-room';

const secs = (ms: number) => {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 90 ? `${s}s` : `${Math.round(s / 60)} min`;
};
const num = (v: unknown) => (typeof v === 'number' ? v : 0);

export interface Signal {
  key: string;
  kind: 'paste' | 'large_insert' | 'tab_hidden' | 'window_blur';
  ts: number;
  participantId: string | null;
  icon: typeof EyeOff;
  text: string;
}

/** Integrity events since the room opened: history from the API, then live ones. */
export function useSignals(conn: RoomConnection | null, roomId: string, slug: string) {
  const history = useQuery({
    queryKey: ['room-events', roomId, conn?.doc.guid],
    queryFn: () => api.json<RoomEvent[]>(`/rooms/${roomId}/events`, { roomKey: slug }),
    staleTime: Infinity,
    enabled: !!conn,
  });
  const live = conn?.events;
  const peers = conn?.peers;
  return useMemo(() => {
    const seen = new Set<string>();
    const all: RoomEvent[] = [];
    const names: Record<string, string> = {};
    for (const e of [...(history.data ?? []), ...(live ?? [])]) {
      if (e.type === 'participant_joined' && e.participantId) {
        names[e.participantId] = String(e.payload.displayName ?? '');
      }
      if (!isIntegrityEvent(e.type)) continue;
      // The same event arrives from both sources; ids differ, timestamps don't.
      const key = `${e.type}:${e.participantId}:${e.serverTs}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(e);
    }
    for (const p of peers ?? []) names[p.state.user.participantId] = p.state.user.name;
    return { events: all.sort((a, b) => a.serverTs - b.serverTs), names };
  }, [history.data, live, peers]);
}

/** Plain-language sentences; "you" for the viewer's own signals. Signals, not verdicts. */
export function describeSignals(
  events: RoomEvent[],
  selfId: string,
  names: Record<string, string>,
): Signal[] {
  const out: Signal[] = [];
  const who = (id: string | null) => (id === selfId ? 'You' : (id && names[id]) || 'Someone');
  const whose = (id: string | null) =>
    id === selfId ? 'Your' : `${(id && names[id]) || 'Someone'}’s`;
  const openHidden = new Set<string>();
  for (const e of events) {
    const id = e.participantId;
    const key = `${e.type}-${e.serverTs}-${id}`;
    switch (e.type) {
      case 'paste':
        out.push({
          key,
          ts: e.serverTs,
          participantId: id,
          kind: 'paste',
          icon: ClipboardPaste,
          text: `${who(id)} pasted ${num(e.payload.chars)} characters into the ${e.payload.target === 'notes' ? 'notes' : 'code'}`,
        });
        break;
      case 'large_insert':
        out.push({
          key,
          ts: e.serverTs,
          participantId: id,
          kind: 'large_insert',
          icon: TextCursorInput,
          text: `${who(id)} inserted ${num(e.payload.chars)} characters at once`,
        });
        break;
      case 'tab_hidden':
        openHidden.add(id ?? '');
        break;
      case 'tab_visible':
        openHidden.delete(id ?? '');
        out.push({
          key,
          ts: e.serverTs,
          participantId: id,
          kind: 'tab_hidden',
          icon: EyeOff,
          text: `${whose(id)} tab was hidden for ${secs(num(e.payload.hiddenMs))}`,
        });
        break;
      case 'window_focus':
        out.push({
          key,
          ts: e.serverTs,
          participantId: id,
          kind: 'window_blur',
          icon: AppWindow,
          text: `${who(id)} left the window for ${secs(num(e.payload.awayMs))}`,
        });
        break;
    }
  }
  for (const id of openHidden) {
    out.push({
      key: `open-${id}`,
      ts: Date.now(),
      participantId: id,
      kind: 'tab_hidden',
      icon: EyeOff,
      text: `${whose(id)} tab is hidden right now`,
    });
  }
  return out;
}

export function SignalList({
  signals,
  sessionStart,
  className,
}: {
  signals: Signal[];
  sessionStart: number;
  className?: string;
}) {
  if (!signals.length) {
    return (
      <p className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
        <ShieldCheck className="size-4 text-success" /> No activity signals yet.
      </p>
    );
  }
  return (
    <ol className={cn('space-y-1.5', className)}>
      {[...signals].reverse().map((s) => (
        <li key={s.key} className="flex items-start gap-2.5 text-[13px]">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border bg-warning/10">
            <s.icon className="size-3.5 text-warning" />
          </span>
          <span className="min-w-0 flex-1 pt-0.5">{s.text}</span>
          <span className="pt-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
            {formatClock(s.ts - sessionStart)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Collapsible strip at the bottom of the candidate's view: the same signals interviewers see. */
export function ActivityStrip({
  signals,
  sessionStart,
}: {
  signals: Signal[];
  sessionStart: number;
}) {
  const [open, setOpen] = useState(false);
  const latest = signals.at(-1);
  return (
    <div className="border-t bg-card/40">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
      >
        <ShieldCheck className="size-3.5 text-primary" />
        <span className="font-medium">Activity</span>
        <span className="truncate">
          {latest ? `· ${latest.text}` : '· Everyone in the room sees the same signals'}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {signals.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 font-mono">{signals.length}</span>
          )}
          {open ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </span>
      </button>
      {open && (
        <div className="max-h-48 overflow-y-auto border-t px-3 py-2">
          <SignalList signals={signals} sessionStart={sessionStart} />
        </div>
      )}
    </div>
  );
}
