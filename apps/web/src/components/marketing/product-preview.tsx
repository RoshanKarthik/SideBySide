import { CheckCircle2, Code2, NotebookPen, PenTool, Play } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** The code the "candidate" types in the hero mockup, as coloured tokens per line. */
const LINES: { t: string; c?: string }[][] = [
  [{ t: 'def ', c: 'k' }, { t: 'two_sum', c: 'f' }, { t: '(nums, target):' }],
  [{ t: '    seen = {}' }],
  [
    { t: '    ' },
    { t: 'for ', c: 'k' },
    { t: 'i, v ' },
    { t: 'in ', c: 'k' },
    { t: 'enumerate', c: 'f' },
    { t: '(nums):' },
  ],
  [
    { t: '        ' },
    { t: 'if ', c: 'k' },
    { t: 'target - v ' },
    { t: 'in ', c: 'k' },
    { t: 'seen:' },
  ],
  [{ t: '            ' }, { t: 'return ', c: 'k' }, { t: 'seen[target - v], i' }],
  [{ t: '        seen[v] = i' }],
];

const COLORS: Record<string, string> = {
  k: 'text-[oklch(0.75_0.16_310)]',
  f: 'text-[oklch(0.8_0.12_205)]',
};

const LINE_CHARS = LINES.map((l) => l.reduce((m, tok) => m + tok.t.length, 0));
/** Characters typed before each line starts. */
const LINE_OFFSETS = LINE_CHARS.map((_, i) => LINE_CHARS.slice(0, i).reduce((a, b) => a + b, 0));
const TOTAL = LINE_CHARS.reduce((a, b) => a + b, 0);

/** A stylised, animated room: two people, live code, tests passing. Decorative only. */
export function ProductPreview({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const [typed, setTyped] = useState(reduced ? TOTAL : 0);

  useEffect(() => {
    if (reduced) return;
    let n = 0;
    const id = setInterval(() => {
      n = n >= TOTAL + 60 ? 0 : n + 1; // Pause at the end, then start over.
      setTyped(Math.min(n, TOTAL));
    }, 45);
    return () => clearInterval(id);
  }, [reduced]);

  const done = typed >= TOTAL;

  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-card/80 shadow-2xl shadow-black/40 backdrop-blur',
        className,
      )}
    >
      {/* Window chrome */}
      <div className="flex items-center gap-3 border-b px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="text-xs font-medium text-muted-foreground">Frontend round – Asha</span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-success">
          <span className="size-1.5 animate-pulse-ring rounded-full bg-success" /> Live
        </span>
        <div className="flex -space-x-1.5">
          <span className="flex size-5 items-center justify-center rounded-full bg-[#2563eb] text-[9px] font-bold text-white ring-2 ring-card">
            P
          </span>
          <span className="flex size-5 items-center justify-center rounded-full bg-[#db2777] text-[9px] font-bold text-white ring-2 ring-card">
            A
          </span>
        </div>
      </div>
      {/* Tabs */}
      <div className="flex gap-4 border-b px-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1 py-2">
          <NotebookPen className="size-3" /> Discuss
        </span>
        <span className="flex items-center gap-1 border-b-2 border-primary py-2 text-foreground">
          <Code2 className="size-3" /> Code
        </span>
        <span className="flex items-center gap-1 py-2">
          <PenTool className="size-3" /> Design
        </span>
        <span className="ml-auto flex items-center gap-1 self-center rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success">
          <Play className="size-2.5" /> Run
        </span>
      </div>
      {/* Editor */}
      <div className="relative px-4 py-3 font-mono text-[12px] leading-6 sm:text-[13px]">
        {LINES.map((line, i) => {
          const chars = LINE_CHARS[i]!;
          const offset = LINE_OFFSETS[i]!;
          const visible = Math.max(0, Math.min(chars, typed - offset));
          const caretHere = typed > offset && typed <= offset + chars && !done;
          let left = visible;
          return (
            <div key={i} className="flex whitespace-pre">
              <span className="mr-4 w-4 text-right text-muted-foreground/40 select-none">
                {i + 1}
              </span>
              <span className="relative">
                {line.map((tok, j) => {
                  const shown = tok.t.slice(0, Math.max(0, left));
                  left -= tok.t.length;
                  return (
                    <span key={j} className={tok.c ? COLORS[tok.c] : undefined}>
                      {shown}
                    </span>
                  );
                })}
                {caretHere && <RemoteCaret name="Asha" color="#db2777" />}
              </span>
            </div>
          );
        })}
        {/* The interviewer's cursor, idling on line 2. */}
        <div className="pointer-events-none absolute top-[2.4rem] left-[9.6rem] sm:left-[10.3rem]">
          <RemoteCaret name="Priya" color="#2563eb" />
        </div>
      </div>
      {/* Test results */}
      <motion.div
        initial={false}
        animate={{ opacity: done ? 1 : 0.35 }}
        className="flex items-center gap-2 border-t bg-background/40 px-4 py-2.5 text-[12px]"
      >
        <CheckCircle2 className={cn('size-4', done ? 'text-success' : 'text-muted-foreground')} />
        <span className={done ? 'font-medium text-success' : 'text-muted-foreground'}>
          {done ? '7 / 7 tests passed' : 'Running tests…'}
        </span>
        <span className="ml-auto text-muted-foreground">3 hidden · 41 ms</span>
      </motion.div>
    </div>
  );
}

function RemoteCaret({ name, color }: { name: string; color: string }) {
  return (
    <span className="relative inline-block h-[1.2em] w-0 align-middle">
      <span
        className="absolute inset-y-0 left-0 w-[2px] animate-pulse"
        style={{ background: color }}
      />
      <span
        className="absolute -top-4 left-0 rounded-sm rounded-bl-none px-1 font-sans text-[9px] font-semibold text-white"
        style={{ background: color }}
      >
        {name}
      </span>
    </span>
  );
}
