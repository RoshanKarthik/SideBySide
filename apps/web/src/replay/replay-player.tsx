import { LANGUAGE_INFO, type ReplayManifest } from '@sidebyside/shared';
import { DOC_FIELDS, getCodeMap, getMeta, readActiveLanguage } from '@sidebyside/shared/doc';
import { ReplayCursor, type ReplayLog } from '@sidebyside/shared/replay';
import Collaboration from '@tiptap/extension-collaboration';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ArrowLeft, Code2, NotebookPen, Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import type * as Y from 'yjs';
import { ThemeToggle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/form';
import { monaco } from '@/editor/monaco';
import { cn, formatClock } from '@/lib/utils';

const SPEEDS = [1, 2, 4, 8] as const;

export function ReplayPlayer({ manifest, log }: { manifest: ReplayManifest; log: ReplayLog }) {
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
  const [tab, setTab] = useState<'discuss' | 'code'>('code');

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
  timeRef.current = time;
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

  const duration = Math.max(1, end - start);
  const pct = (ts: number) => `${((ts - start) / duration) * 100}%`;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b px-3 py-2">
        <Button variant="ghost" size="icon" asChild aria-label="Back to dashboard">
          <Link to="/dashboard">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate font-semibold">Replay · {manifest.room.title}</h1>
        <ThemeToggle />
      </header>

      <nav role="tablist" aria-label="Replay" className="flex gap-1 border-b px-3">
        {(
          [
            { id: 'discuss', label: 'Discuss', icon: NotebookPen },
            { id: 'code', label: 'Code', icon: Code2 },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground',
              tab === id && 'border-primary text-foreground',
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </nav>

      <main className="min-h-0 flex-1">
        {tab === 'discuss' ? (
          <ReplayNotes key={generation} doc={cursor.doc} />
        ) : (
          <ReplayCode key={generation} doc={cursor.doc} time={time} />
        )}
      </main>

      <footer className="border-t px-3 py-3">
        <div className="relative mx-1 h-6">
          <input
            type="range"
            aria-label="Timeline"
            min={start}
            max={end}
            step={100}
            value={time}
            onChange={(e) => seek(Number(e.target.value))}
            className="absolute inset-x-0 top-1/2 w-full -translate-y-1/2 accent-[var(--primary)]"
          />
          {manifest.markers.map((m) => (
            <button
              key={`${m.ts}-${m.label}`}
              type="button"
              title={`${formatClock(m.ts - start)} · ${m.label}`}
              aria-label={`Jump to ${m.label} at ${formatClock(m.ts - start)}`}
              onClick={() => seek(m.ts)}
              className={cn(
                'absolute top-0 h-2.5 w-1.5 -translate-x-1/2 rounded-sm',
                m.status === 'ok' ? 'bg-success' : 'bg-destructive',
              )}
              style={{ left: pct(m.ts) }}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            onClick={() => {
              if (!playing && time >= end) seek(start);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause /> : <Play />}
            {playing ? 'Pause' : 'Play'}
          </Button>
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            Speed
            <NativeSelect
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
          </label>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {formatClock(time - start)} / {formatClock(duration)}
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            {manifest.markers.length} code run{manifest.markers.length === 1 ? '' : 's'} · click a
            marker to jump
          </span>
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
      theme: document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs',
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
