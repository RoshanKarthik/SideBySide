import {
  LANGUAGE_INFO,
  type ReplayManifest,
  type ReplayMarker,
  type ReplayMarkerKind,
} from '@sidebyside/shared';
import { DOC_FIELDS, getCodeMap, getMeta, readActiveLanguage } from '@sidebyside/shared/doc';
import { ReplayCursor, type ReplayLog } from '@sidebyside/shared/replay';
import Collaboration from '@tiptap/extension-collaboration';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  AppWindow,
  ArrowLeft,
  BookOpen,
  ClipboardPaste,
  Code2,
  EyeOff,
  FlaskConical,
  Lightbulb,
  ListOrdered,
  NotebookPen,
  Pause,
  PenTool,
  Play,
  SkipBack,
  SkipForward,
  StickyNote,
  Terminal,
} from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@/lib/navigation';
import type * as Y from 'yjs';
import { LogoMark, ThemeToggle } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Badge, Kbd, Spinner } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/form';
import { Tooltip } from '@/components/ui/overlay';
import { monaco, monacoTheme } from '@/editor/monaco';
import { cn, formatClock } from '@/lib/utils';

// The whiteboard library is large; load it only when the Design tab is opened.
const ReplayBoard = lazy(() => import('@/design/replay-board'));

const SPEEDS = [1, 2, 4, 8] as const;

const KIND_INFO: Record<ReplayMarkerKind, { label: string; icon: typeof Code2 }> = {
  code_run: { label: 'Code runs', icon: Terminal },
  tests_run: { label: 'Test runs', icon: FlaskConical },
  question_shown: { label: 'Questions', icon: BookOpen },
  hint_revealed: { label: 'Hints', icon: Lightbulb },
  paste: { label: 'Pastes', icon: ClipboardPaste },
  tab_hidden: { label: 'Tab hidden', icon: EyeOff },
  window_blur: { label: 'Left window', icon: AppWindow },
  note_timestamp: { label: 'Your notes', icon: StickyNote },
};

const TONE: Record<ReplayMarker['tone'], string> = {
  ok: 'bg-success',
  error: 'bg-destructive',
  info: 'bg-primary',
  signal: 'bg-warning',
};

export function ReplayPlayer({
  manifest,
  log,
  onRound,
}: {
  manifest: ReplayManifest;
  log: ReplayLog;
  onRound: (round: number) => void;
}) {
  const cursor = useMemo(() => new ReplayCursor(log), [log]);
  const [start, end] = useMemo(() => {
    const first = log.updates[0]?.ts ?? manifest.startTs;
    const last = log.updates.at(-1)?.ts ?? manifest.endTs;
    return [Math.min(manifest.startTs, first), Math.max(manifest.endTs, last)];
  }, [log, manifest]);

  const [time, setTime] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [generation, setGeneration] = useState(0);
  const [tab, setTab] = useState<'discuss' | 'code' | 'design'>('code');
  const [hiddenKinds, setHiddenKinds] = useState<Set<ReplayMarkerKind>>(new Set());

  const seek = useCallback(
    (t: number) => {
      const clamped = Math.min(end, Math.max(start, t));
      if (cursor.seek(clamped)) setGeneration(cursor.generation);
      setTime(clamped);
    },
    [cursor, start, end],
  );

  useEffect(() => {
    seek(start);
  }, [seek, start]);

  // Playback clock.
  const timeRef = useRef(time);
  useEffect(() => {
    timeRef.current = time;
  }, [time]);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const next = timeRef.current + (now - last) * speed;
      last = now;
      seek(next);
      if (next >= end) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, seek, end]);

  const markers = manifest.markers.filter((m) => !hiddenKinds.has(m.kind));
  const kinds = [...new Set(manifest.markers.map((m) => m.kind))];
  const next = markers.find((m) => m.ts > time + 250);
  const prev = [...markers].reverse().find((m) => m.ts < time - 250);

  const toggle = () => {
    if (!playing && time >= end) seek(start);
    setPlaying(!playing);
  };

  // Space plays/pauses; arrows step between markers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable=true]'))
        return;
      if (e.key === ' ') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'ArrowRight' && next) seek(next.ts);
      else if (e.key === 'ArrowLeft' && prev) seek(prev.ts);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const duration = Math.max(1, end - start);
  const pct = (ts: number) => `${((ts - start) / duration) * 100}%`;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b bg-card/30 px-3 py-2">
        <Button variant="ghost" size="icon-sm" asChild aria-label="Back to the session">
          <Link to={`/sessions/${manifest.room.id}`}>
            <ArrowLeft />
          </Link>
        </Button>
        <LogoMark className="size-6" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{manifest.room.title}</h1>
          <p className="text-xs text-muted-foreground">Replay</p>
        </div>
        {manifest.rounds > 1 && (
          <div className="flex rounded-lg bg-muted p-0.5" role="tablist" aria-label="Round">
            {Array.from({ length: manifest.rounds }, (_, i) => i + 1).map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={manifest.round === r}
                onClick={() => onRound(r)}
                className={cn(
                  'h-7 rounded-md px-3 text-[13px] font-medium text-muted-foreground',
                  manifest.round === r && 'bg-background text-foreground shadow-sm',
                )}
              >
                Round {r}
              </button>
            ))}
          </div>
        )}
        <ThemeToggle />
      </header>

      <nav
        role="tablist"
        aria-label="Replay"
        className="flex items-center gap-1 border-b px-3 py-1.5"
      >
        {(
          [
            { id: 'discuss', label: 'Discuss', icon: NotebookPen },
            { id: 'code', label: 'Code', icon: Code2 },
            { id: 'design', label: 'Design', icon: PenTool },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              tab === id && 'bg-muted text-foreground shadow-[inset_0_0_0_1px_var(--border)]',
            )}
          >
            <Icon className={cn('size-4', tab === id && 'text-primary')} />
            {label}
          </button>
        ))}
      </nav>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1">
          {tab === 'discuss' && <ReplayNotes key={generation} doc={cursor.doc} />}
          {tab === 'code' && <ReplayCode key={generation} doc={cursor.doc} time={time} />}
          {tab === 'design' && (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Spinner />
                </div>
              }
            >
              <ReplayBoard
                doc={cursor.doc}
                time={time}
                roomId={manifest.room.id}
                round={manifest.round}
              />
            </Suspense>
          )}
        </main>
        <aside
          aria-label="Key moments"
          className="hidden w-72 shrink-0 flex-col border-l bg-card/30 lg:flex"
        >
          <div className="flex items-center gap-2 border-b px-3 py-2.5 text-sm font-medium">
            <ListOrdered className="size-4 text-primary" /> Key moments
            <span className="ml-auto text-xs text-muted-foreground">{markers.length}</span>
          </div>
          <ol className="min-h-0 flex-1 overflow-y-auto p-2">
            {markers.length === 0 && (
              <li className="px-2 py-6 text-center text-sm text-muted-foreground">
                Nothing marked in this round.
              </li>
            )}
            {markers.map((m) => {
              const Icon = KIND_INFO[m.kind].icon;
              const active = Math.abs(m.ts - time) < 600;
              return (
                <li key={`${m.ts}-${m.kind}-${m.label}`}>
                  <button
                    type="button"
                    onClick={() => seek(m.ts)}
                    className={cn(
                      'flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted',
                      active && 'bg-accent',
                    )}
                  >
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', TONE[m.tone])} />
                    <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">{m.label}</span>
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      {formatClock(m.ts - start)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>

      <footer className="border-t bg-card/30 px-4 pt-3 pb-3">
        <div className="relative mx-1 h-7">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
          <div
            className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-brand-gradient"
            style={{ width: pct(time) }}
          />
          <input
            type="range"
            aria-label="Timeline"
            min={start}
            max={end}
            step={100}
            value={time}
            onChange={(e) => seek(Number(e.target.value))}
            className="absolute inset-x-0 top-1/2 w-full -translate-y-1/2 cursor-pointer opacity-0"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow"
            style={{ left: pct(time) }}
          />
          {markers.map((m) => (
            <Tooltip
              key={`${m.ts}-${m.kind}-${m.label}`}
              side="top"
              content={`${formatClock(m.ts - start)} · ${m.label}`}
            >
              <button
                type="button"
                aria-label={`Jump to ${m.label} at ${formatClock(m.ts - start)}`}
                onClick={() => seek(m.ts)}
                className={cn(
                  'absolute top-0 h-2.5 w-1.5 -translate-x-1/2 rounded-sm ring-1 ring-background transition-transform hover:scale-y-150',
                  TONE[m.tone],
                )}
                style={{ left: pct(m.ts) }}
              />
            </Tooltip>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Tooltip content="Previous moment (←)">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Previous moment"
              disabled={!prev}
              onClick={() => prev && seek(prev.ts)}
            >
              <SkipBack />
            </Button>
          </Tooltip>
          <Button size="sm" onClick={toggle} className="w-24">
            {playing ? <Pause /> : <Play />}
            {playing ? 'Pause' : 'Play'}
          </Button>
          <Tooltip content="Next moment (→)">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Next moment"
              disabled={!next}
              onClick={() => next && seek(next.ts)}
            >
              <SkipForward />
            </Button>
          </Tooltip>
          <NativeSelect
            aria-label="Playback speed"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])}
            className="h-8"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </NativeSelect>
          <span className="font-mono text-sm text-muted-foreground tabular-nums">
            {formatClock(time - start)} / {formatClock(duration)}
          </span>
          <span className="hidden items-center gap-1 text-xs text-muted-foreground md:flex">
            <Kbd>Space</Kbd> play
          </span>
          <div className="ml-auto flex flex-wrap gap-1">
            {kinds.map((k) => {
              const off = hiddenKinds.has(k);
              const Icon = KIND_INFO[k].icon;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={!off}
                  onClick={() =>
                    setHiddenKinds((s) => {
                      const n = new Set(s);
                      if (n.has(k)) n.delete(k);
                      else n.add(k);
                      return n;
                    })
                  }
                  className={cn(
                    'flex h-7 items-center gap-1 rounded-full border px-2 text-[11px] transition-opacity',
                    off ? 'opacity-40' : 'bg-background',
                  )}
                >
                  <Icon className="size-3" /> {KIND_INFO[k].label}
                </button>
              );
            })}
            {kinds.length === 0 && <Badge>No markers</Badge>}
          </div>
        </div>
      </footer>
    </div>
  );
}

function ReplayNotes({ doc }: { doc: Y.Doc }) {
  const editor = useEditor(
    {
      editable: false,
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Collaboration.configure({ document: doc, field: DOC_FIELDS.notes }),
      ],
    },
    [doc],
  );
  return (
    <div className="notes-editor h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ReplayCode({ doc, time }: { doc: Y.Doc; time: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [language, setLanguage] = useState(() => readActiveLanguage(doc));

  useEffect(() => {
    const editor = monaco.editor.create(hostRef.current!, {
      readOnly: true,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      scrollBeyondLastLine: false,
      theme: monacoTheme(),
      fontFamily: "'Geist Mono Variable', 'Cascadia Code', Consolas, monospace",
    });
    editorRef.current = editor;
    return () => {
      editor.getModel()?.dispose();
      editor.dispose();
    };
  }, []);

  // Re-read the document whenever the replay time moves.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const lang = readActiveLanguage(doc);
    setLanguage(lang);
    const text = getCodeMap(doc).get(lang)?.toString() ?? '';
    let model = editor.getModel();
    if (!model || model.getLanguageId() !== LANGUAGE_INFO[lang].monacoId) {
      model?.dispose();
      model = monaco.editor.createModel(text, LANGUAGE_INFO[lang].monacoId);
      editor.setModel(model);
    } else if (model.getValue() !== text) {
      model.setValue(text);
    }
  }, [doc, time]);

  // Language switches are changes to the meta map, which the time effect also picks up.
  useEffect(() => {
    const meta = getMeta(doc);
    const update = () => setLanguage(readActiveLanguage(doc));
    meta.observe(update);
    return () => meta.unobserve(update);
  }, [doc]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-1.5 text-xs text-muted-foreground">
        {LANGUAGE_INFO[language].label}
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
