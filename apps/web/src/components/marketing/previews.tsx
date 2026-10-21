import {
  CheckCircle2,
  Circle,
  ClipboardPaste,
  Code2,
  EyeOff,
  Mic,
  MicOff,
  MonitorUp,
  NotebookPen,
  PenTool,
  PhoneOff,
  Play,
  Star,
  Video,
  XCircle,
} from 'lucide-react';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/*
 * Small, code-built pictures of the product for the landing page. They are decorative
 * (aria-hidden) and use the theme tokens, so they work in light and dark.
 */

const KEYWORD = 'text-[oklch(0.5_0.2_305)] dark:text-[oklch(0.78_0.15_310)]';
const FUNC = 'text-[oklch(0.5_0.14_235)] dark:text-[oklch(0.8_0.12_210)]';
const STRING = 'text-[oklch(0.52_0.13_150)] dark:text-[oklch(0.8_0.13_150)]';
const COMMENT = 'text-muted-foreground/70 italic';

type Token = { t: string; c?: string };

const TWO_SUM: Token[][] = [
  [{ t: 'def ', c: KEYWORD }, { t: 'two_sum', c: FUNC }, { t: '(nums, target):' }],
  [{ t: '    seen = {}' }],
  [
    { t: '    ' },
    { t: 'for ', c: KEYWORD },
    { t: 'i, v ' },
    { t: 'in ', c: KEYWORD },
    { t: 'enumerate', c: FUNC },
    { t: '(nums):' },
  ],
  [
    { t: '        ' },
    { t: 'if ', c: KEYWORD },
    { t: 'target - v ' },
    { t: 'in ', c: KEYWORD },
    { t: 'seen:' },
  ],
  [{ t: '            ' }, { t: 'return ', c: KEYWORD }, { t: 'seen[target - v], i' }],
  [{ t: '        seen[v] = i' }],
];

const LINE_CHARS = TWO_SUM.map((l) => l.reduce((m, tok) => m + tok.t.length, 0));
const LINE_OFFSETS = LINE_CHARS.map((_, i) => LINE_CHARS.slice(0, i).reduce((a, b) => a + b, 0));
const TOTAL = LINE_CHARS.reduce((a, b) => a + b, 0);

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const query = window.matchMedia(REDUCED_MOTION);
      query.addEventListener('change', cb);
      return () => query.removeEventListener('change', cb);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
  );
}

/** Types the sample solution out character by character, then pauses and starts over. */
function useTyping(): number {
  const reduced = useReducedMotion();
  const [typed, setTyped] = useState(reduced ? TOTAL : 0);
  useEffect(() => {
    if (reduced) return;
    let n = 0;
    const id = setInterval(() => {
      n = n >= TOTAL + 70 ? 0 : n + 1;
      setTyped(Math.min(n, TOTAL));
    }, 45);
    return () => clearInterval(id);
  }, [reduced]);
  return typed;
}

export function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-xl border bg-card text-[12px] shadow-raised select-none',
        className,
      )}
    >
      {children}
    </div>
  );
}

function Caret({ name, color }: { name: string; color: string }) {
  return (
    <span className="relative inline-block h-[1.2em] w-0 align-middle">
      <span className="absolute inset-y-0 left-0 w-[2px]" style={{ background: color }} />
      <span
        className="absolute -top-4 left-0 rounded-sm rounded-bl-none px-1 font-sans text-[9px] font-semibold whitespace-nowrap text-white"
        style={{ background: color }}
      >
        {name}
      </span>
    </span>
  );
}

function CodeLines({ typed, compact }: { typed: number; compact?: boolean }) {
  const done = typed >= TOTAL;
  return (
    <div className={cn('font-mono leading-6', compact ? 'text-[11px]' : 'text-[12px]')}>
      {TWO_SUM.map((line, i) => {
        const chars = LINE_CHARS[i]!;
        const offset = LINE_OFFSETS[i]!;
        const caretHere = typed > offset && typed <= offset + chars && !done;
        let left = Math.max(0, Math.min(chars, typed - offset));
        return (
          <div key={i} className="flex whitespace-pre">
            <span className="mr-3 w-4 text-right text-muted-foreground/40">{i + 1}</span>
            <span className="relative">
              {line.map((tok, j) => {
                const shown = tok.t.slice(0, Math.max(0, left));
                left -= tok.t.length;
                return (
                  <span key={j} className={tok.c}>
                    {shown}
                  </span>
                );
              })}
              {caretHere && <Caret name="Asha" color="#db2777" />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A video tile: a soft gradient "camera" with a silhouette, or initials when the camera is off. */
function Tile({
  name,
  hue,
  muted,
  speaking,
  cameraOff,
  className,
}: {
  name: string;
  hue: number;
  muted?: boolean;
  speaking?: boolean;
  cameraOff?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex aspect-video items-end overflow-hidden rounded-lg',
        speaking && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
        className,
      )}
      style={{
        background: cameraOff
          ? `oklch(0.3 0.02 ${hue})`
          : `linear-gradient(160deg, oklch(0.78 0.06 ${hue}), oklch(0.5 0.08 ${hue + 30}))`,
      }}
    >
      {cameraOff ? (
        <span
          className="absolute inset-0 m-auto flex size-9 items-center justify-center rounded-full text-[13px] font-semibold text-white"
          style={{ background: `oklch(0.55 0.15 ${hue})` }}
        >
          {name[0]}
        </span>
      ) : (
        // Head and shoulders.
        <svg viewBox="0 0 100 56" className="absolute inset-0 size-full" preserveAspectRatio="none">
          <circle cx="50" cy="24" r="10" fill={`oklch(0.92 0.03 ${hue} / 0.9)`} />
          <path d="M28 56 Q30 38 50 37 Q70 38 72 56 Z" fill={`oklch(0.92 0.03 ${hue} / 0.9)`} />
        </svg>
      )}
      <span className="relative m-1.5 flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
        {muted ? <MicOff className="size-2.5" /> : <Mic className="size-2.5" />}
        {name}
      </span>
    </div>
  );
}

function CallControls({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <span className="flex size-6 items-center justify-center rounded-md bg-muted">
        <Video className="size-3" />
      </span>
      <span className="flex size-6 items-center justify-center rounded-md bg-muted">
        <Mic className="size-3" />
      </span>
      <span className="flex size-6 items-center justify-center rounded-md bg-muted">
        <MonitorUp className="size-3" />
      </span>
      <span className="flex h-6 items-center gap-1 rounded-md bg-destructive px-2 text-[10px] font-medium text-white">
        <PhoneOff className="size-3" /> Leave
      </span>
    </div>
  );
}

/** The hero picture: the whole room — call, editor with two cursors, tests and a score. */
export function RoomPreview({ className }: { className?: string }) {
  const typed = useTyping();
  const done = typed >= TOTAL;
  return (
    <Frame className={className}>
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <span className="flex size-5 items-center justify-center rounded bg-primary text-[9px] font-bold text-primary-foreground">
          A
        </span>
        <span className="font-medium">Backend engineer · Round 2</span>
        <span className="flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
          <span className="size-1.5 animate-pulse-ring rounded-full bg-success" /> Live · 24:18
        </span>
        <CallControls className="ml-auto hidden sm:flex" />
      </div>
      <div className="grid grid-cols-[1fr_9.5rem] max-sm:grid-cols-1">
        <div className="min-w-0 border-r max-sm:border-r-0">
          <div className="flex items-center gap-3 border-b px-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1 py-1.5">
              <NotebookPen className="size-3" /> Discuss
            </span>
            <span className="flex items-center gap-1 border-b-2 border-primary py-1.5 font-medium text-foreground">
              <Code2 className="size-3" /> Code
            </span>
            <span className="flex items-center gap-1 py-1.5">
              <PenTool className="size-3" /> Design
            </span>
            <span className="ml-auto flex items-center gap-1 rounded bg-success px-1.5 py-0.5 text-[10px] font-medium text-white">
              <Play className="size-2.5" /> Run tests
            </span>
          </div>
          <div className="relative min-h-[10.5rem] px-3 py-3">
            <CodeLines typed={typed} />
            <div className="pointer-events-none absolute top-[2.6rem] left-[8.4rem]">
              <Caret name="Priya" color="#2563eb" />
            </div>
          </div>
          <div
            className={cn(
              'flex items-center gap-2 border-t px-3 py-2 transition-opacity duration-500',
              done ? 'opacity-100' : 'opacity-45',
            )}
          >
            {done ? (
              <CheckCircle2 className="size-3.5 text-success" />
            ) : (
              <Circle className="size-3.5 text-muted-foreground" />
            )}
            <span className={done ? 'font-medium text-success' : 'text-muted-foreground'}>
              {done ? '7 / 7 tests passed' : 'Waiting for a test run…'}
            </span>
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
              {done ? 'Score 100' : 'Score —'}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2 p-2 max-sm:grid max-sm:grid-cols-2">
          <Tile name="Priya" hue={250} speaking={!done} />
          <Tile name="Asha" hue={20} speaking={done} />
          <div className="mt-auto rounded-md border bg-muted/40 p-2 max-sm:hidden">
            <p className="text-[10px] font-medium text-muted-foreground uppercase">Private notes</p>
            <p className="mt-1 leading-snug">
              <span className="font-mono text-[10px] text-primary">18:42</span> Clear about
              trade-offs; went straight to a hash map.
            </p>
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// One small picture per part of the interview
// ---------------------------------------------------------------------------

export function CallMini() {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Tile name="You" hue={250} />
        <Tile name="Candidate" hue={20} speaking />
      </div>
      <CallControls className="justify-center" />
    </div>
  );
}

export function EditorMini() {
  return (
    <div className="space-y-2">
      <div className="rounded-lg border bg-background px-2.5 py-2">
        <CodeLines typed={TOTAL} compact />
      </div>
      <div className="rounded-lg border bg-background px-2.5 py-1.5 font-mono text-[11px]">
        <span className="text-muted-foreground">$ python main.py</span>
        <br />
        <span className={STRING}>[0, 1]</span>
        <span className="float-right text-muted-foreground">38 ms</span>
      </div>
    </div>
  );
}

const TESTS: { name: string; ok: boolean; hidden?: boolean; w: number }[] = [
  { name: 'Example 1', ok: true, w: 1 },
  { name: 'Example 2', ok: true, w: 1 },
  { name: 'Large input', ok: true, hidden: true, w: 3 },
  { name: 'Negative numbers', ok: false, hidden: true, w: 2 },
];

export function TestsMini() {
  return (
    <div className="rounded-lg border bg-background">
      <div className="flex items-center justify-between border-b px-2.5 py-1.5">
        <span className="font-medium">3 / 4 passed</span>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
          Score 71
        </span>
      </div>
      <ul className="divide-y">
        {TESTS.map((t) => (
          <li key={t.name} className="flex items-center gap-2 px-2.5 py-1.5">
            {t.ok ? (
              <CheckCircle2 className="size-3.5 text-success" />
            ) : (
              <XCircle className="size-3.5 text-destructive" />
            )}
            <span>{t.name}</span>
            {t.hidden && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <EyeOff className="size-2.5" /> hidden
              </span>
            )}
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">×{t.w}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BoardMini() {
  return (
    <div className="relative h-36 overflow-hidden rounded-lg border bg-background bg-dots">
      <svg viewBox="0 0 240 130" className="absolute inset-0 size-full">
        <g fill="none" strokeWidth="1.5" className="stroke-foreground/60">
          <rect x="12" y="50" width="52" height="28" rx="4" />
          <rect x="94" y="20" width="56" height="28" rx="4" />
          <rect x="94" y="82" width="56" height="28" rx="4" />
          <path d="M180 30 h40 v24 h-40 z" />
          <ellipse cx="200" cy="100" rx="22" ry="9" />
          <path d="M64 60 L94 36 M64 68 L94 94 M150 34 L180 40 M150 96 L178 100" />
        </g>
        <g className="fill-muted-foreground" fontSize="8" fontFamily="var(--font-sans)">
          <text x="22" y="67">
            Client
          </text>
          <text x="104" y="37">
            API
          </text>
          <text x="101" y="99">
            Worker
          </text>
          <text x="186" y="45">
            Cache
          </text>
          <text x="191" y="103">
            DB
          </text>
        </g>
      </svg>
      <span className="absolute top-[3.4rem] left-[9.5rem]">
        <svg viewBox="0 0 12 12" className="size-3 fill-[#db2777]">
          <path d="M0 0 L12 5 L6 6 L5 12 Z" />
        </svg>
        <span className="ml-2 rounded bg-[#db2777] px-1 text-[9px] font-semibold text-white">
          Asha
        </span>
      </span>
    </div>
  );
}

export function PanelMini() {
  return (
    <div className="space-y-2">
      <div className="rounded-lg border bg-background px-2.5 py-2 leading-relaxed">
        <p>
          <span className="font-mono text-[10px] text-primary">06:12</span> Asked good clarifying
          questions about duplicates.
        </p>
        <p>
          <span className="font-mono text-[10px] text-primary">21:40</span> Found the O(n) approach
          after one hint.
        </p>
      </div>
      <div className="rounded-lg border bg-background px-2.5 py-2">
        {['Problem solving', 'Code quality', 'Communication'].map((c, i) => (
          <div key={c} className="flex items-center justify-between py-0.5">
            <span>{c}</span>
            <span className="flex gap-0.5">
              {[0, 1, 2, 3].map((s) => (
                <Star
                  key={s}
                  className={cn(
                    'size-3',
                    s < [3, 4, 3][i]! ? 'fill-warning text-warning' : 'text-muted-foreground/40',
                  )}
                />
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SignalsMini() {
  const rows = [
    { icon: ClipboardPaste, text: 'Pasted 214 characters into Code', time: '12:04' },
    { icon: EyeOff, text: 'Switched away for 9 s', time: '15:31' },
    { icon: Code2, text: 'Ran the code — 2 tests failed', time: '16:02' },
  ];
  return (
    <ul className="space-y-1.5">
      {rows.map(({ icon: Icon, text, time }) => (
        <li
          key={text}
          className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5"
        >
          <Icon className="size-3.5 text-warning" />
          <span className="min-w-0 flex-1 truncate">{text}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{time}</span>
        </li>
      ))}
      <li className="px-1 text-[11px] text-muted-foreground">Visible to everyone in the room.</li>
    </ul>
  );
}

export function ReplayMini() {
  const marks = [
    { at: 12, tone: 'bg-primary' },
    { at: 30, tone: 'bg-warning' },
    { at: 46, tone: 'bg-destructive' },
    { at: 63, tone: 'bg-success' },
    { at: 81, tone: 'bg-success' },
  ];
  return (
    <div className="space-y-2.5 rounded-lg border bg-background px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Play className="size-3" />
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">21:40 / 45:12</span>
        <span className="ml-auto rounded border px-1 text-[10px] text-muted-foreground">2×</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 w-[48%] rounded-full bg-primary/60" />
        {marks.map((m) => (
          <span
            key={m.at}
            className={cn('absolute top-1/2 size-2 -translate-y-1/2 rounded-full', m.tone)}
            style={{ left: `${m.at}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-primary" /> Question
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-warning" /> Hint
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-success" /> Tests passed
        </span>
      </div>
    </div>
  );
}

export function BrandMini() {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-[oklch(0.55_0.17_160)] text-[11px] font-bold text-white">
          N
        </span>
        <span className="font-semibold">Northwind Labs</span>
      </div>
      <p className="mt-3 font-medium">Frontend engineer interview</p>
      <p className="text-[11px] text-muted-foreground">with Priya Raman · 45 min</p>
      <span className="mt-3 flex h-7 items-center justify-center rounded-md bg-[oklch(0.55_0.17_160)] text-[11px] font-medium text-white">
        Join interview
      </span>
    </div>
  );
}

/** A snippet of the HTML/CSS/JS live preview. */
export function PreviewMini() {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-lg border bg-background px-2 py-1.5 font-mono text-[10px] leading-5">
        <span className={KEYWORD}>&lt;button</span> <span className={FUNC}>class</span>=
        <span className={STRING}>"cta"</span>
        <span className={KEYWORD}>&gt;</span>
        <br />
        &nbsp;&nbsp;Buy now
        <br />
        <span className={KEYWORD}>&lt;/button&gt;</span>
        <br />
        <span className={COMMENT}>/* styles.css */</span>
      </div>
      <div className="flex items-center justify-center rounded-lg border bg-white">
        <span className="rounded-full bg-[#2563eb] px-3 py-1 text-[11px] font-semibold text-white shadow">
          Buy now
        </span>
      </div>
    </div>
  );
}
