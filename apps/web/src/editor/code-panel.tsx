import {
  LANGUAGES,
  LANGUAGE_INFO,
  LIMITS,
  isRunnable,
  type Lang,
  type Participant,
  type SharedRun,
} from '@sidebyside/shared';
import { getCodeMap, getMeta, getStdin, readActiveLanguage } from '@sidebyside/shared/doc';
import { ChevronDown, ChevronUp, Loader2, Play } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MonacoBinding } from 'y-monaco';
import { Button } from '@/components/ui/button';
import { NativeSelect, Textarea } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import type { RoomConnection } from '@/room/use-room';
import { CodeRunner, type RunPhase } from '@/runner/runner';
import { monaco } from './monaco';
import { remoteCursorCss } from './remote-cursors';
import { applyTextDiff } from './text-binding';

function monacoTheme(): string {
  return document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs';
}

/** Tracks the room's active language, which everyone shares. */
function useActiveLanguage(conn: RoomConnection): Lang {
  const [lang, setLang] = useState<Lang>(() => readActiveLanguage(conn.doc));
  useEffect(() => {
    const meta = getMeta(conn.doc);
    const update = () => setLang(readActiveLanguage(conn.doc));
    update();
    meta.observe(update);
    return () => meta.unobserve(update);
  }, [conn.doc, conn.synced]);
  return lang;
}

export default function CodePanel({
  conn,
  participant,
}: {
  conn: RoomConnection;
  participant: Participant;
}) {
  const language = useActiveLanguage(conn);
  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);

  // One editor instance, created when its container mounts; one model per language so
  // switching keeps each buffer's undo state.
  const hostRef = useCallback((host: HTMLDivElement | null) => {
    if (!host) return;
    const instance = monaco.editor.create(host, {
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
      scrollBeyondLastLine: false,
      tabSize: 4,
      theme: monacoTheme(),
      model: null,
      padding: { top: 8 },
    });
    setEditor(instance);
    const onTheme = () => monaco.editor.setTheme(monacoTheme());
    window.addEventListener('sbs-theme', onTheme);
    return () => {
      window.removeEventListener('sbs-theme', onTheme);
      instance.dispose();
      for (const lang of LANGUAGES)
        monaco.editor.getModel(monaco.Uri.parse(`file:///${lang}/main`))?.dispose();
      setEditor(null);
    };
  }, []);

  // Bind the active language's shared text to the editor.
  useEffect(() => {
    if (!editor || !conn.synced) return;
    const ytext = getCodeMap(conn.doc).get(language);
    if (!ytext) return;
    const uri = monaco.Uri.parse(`file:///${language}/main`);
    const model =
      monaco.editor.getModel(uri) ??
      monaco.editor.createModel('', LANGUAGE_INFO[language].monacoId, uri);
    editor.setModel(model);
    const binding = new MonacoBinding(ytext, model, new Set([editor]), conn.provider.awareness);
    return () => {
      binding.destroy();
      editor.setModel(null);
      // Models stay alive until the panel unmounts: the TypeScript worker may still be
      // checking one, and disposing it mid-check throws inside Monaco.
    };
  }, [editor, conn.doc, conn.provider, conn.synced, language]);

  const cursorCss = useMemo(
    () => remoteCursorCss(conn.peers, conn.doc.clientID),
    [conn.peers, conn.doc.clientID],
  );

  const changeLanguage = (next: Lang) => {
    if (next === language) return;
    getMeta(conn.doc).set('activeLanguage', next);
    conn.send({
      kind: 'event',
      event: { type: 'language_changed', payload: { from: language, to: next } },
    });
  };

  return (
    <div className="flex h-full flex-col">
      <style>{cursorCss}</style>
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5">
        <label htmlFor="language" className="sr-only">
          Language
        </label>
        <NativeSelect
          id="language"
          value={language}
          onChange={(e) => changeLanguage(e.target.value as Lang)}
          className="h-8"
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_INFO[l].label}
              {LANGUAGE_INFO[l].runnable ? '' : ' (edit only)'}
            </option>
          ))}
        </NativeSelect>
        <span className="flex-1" />
        <RunControls conn={conn} participant={participant} language={language} />
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="absolute inset-0" aria-label="Code editor" />
      </div>
      <OutputDrawer conn={conn} />
    </div>
  );
}

function RunControls({
  conn,
  participant,
  language,
}: {
  conn: RoomConnection;
  participant: Participant;
  language: Lang;
}) {
  const runner = useMemo(() => new CodeRunner(), []);
  const [phase, setPhase] = useState<RunPhase | null>(null);
  useEffect(() => () => runner.dispose(), [runner]);

  const runnable = isRunnable(language);

  async function run() {
    const source = getCodeMap(conn.doc).get(language)?.toString() ?? '';
    const stdin = getStdin(conn.doc).toString();
    if (source.length > LIMITS.sourceBytes || stdin.length > LIMITS.stdinBytes) {
      conn.showRun(localRun(participant, language, 'error', 'Code or input is larger than 64 KB.'));
      return;
    }
    setPhase('running');
    const output = await runner.run(language, source, stdin, setPhase);
    setPhase(null);
    const runId = crypto.randomUUID();
    const shared: SharedRun = {
      ...output,
      runId,
      language,
      participantId: participant.id,
      displayName: participant.displayName,
      serverTs: Date.now(),
    };
    conn.showRun(shared);
    const sent = conn.send({
      kind: 'code_run',
      run: { ...output, runId, language, source, stdin },
    });
    if (!sent) {
      conn.showRun({
        ...shared,
        stderr: `${shared.stderr}\n(Offline: this run was not shared or recorded.)`.trim(),
      });
    }
  }

  return (
    <Button
      size="sm"
      variant="success"
      onClick={run}
      disabled={!runnable || phase !== null}
      title={
        runnable
          ? 'Run the code'
          : `${LANGUAGE_INFO[language].label} can be edited but not run in the browser yet`
      }
    >
      {phase ? <Loader2 className="animate-spin" /> : <Play />}
      {phase === 'loading' ? 'Loading Python…' : phase === 'running' ? 'Running…' : 'Run'}
    </Button>
  );
}

function localRun(
  participant: Participant,
  language: Lang,
  status: SharedRun['status'],
  stderr: string,
): SharedRun {
  return {
    runId: crypto.randomUUID(),
    language,
    status,
    stdout: '',
    stderr,
    exitCode: null,
    timeMs: 0,
    memoryKb: null,
    participantId: participant.id,
    displayName: participant.displayName,
    serverTs: Date.now(),
  };
}

function OutputDrawer({ conn }: { conn: RoomConnection }) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<'output' | 'stdin'>('output');
  const run = conn.lastRun;
  // A new run (from anyone) brings the output into view.
  const [shownRunId, setShownRunId] = useState(run?.runId);
  if (run && run.runId !== shownRunId) {
    setShownRunId(run.runId);
    setOpen(true);
    setTab('output');
  }

  return (
    <div className="border-t">
      <div className="flex items-center gap-1 px-2">
        {(['output', 'stdin'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setOpen(true);
            }}
            className={cn(
              'px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground',
              open && tab === t && 'text-foreground',
            )}
          >
            {t === 'output' ? 'Output' : 'Input (stdin)'}
          </button>
        ))}
        {run && (
          <span className="ml-2 truncate text-xs text-muted-foreground">
            {run.displayName} ran {LANGUAGE_INFO[run.language].label} ·{' '}
            <span className={run.status === 'ok' ? 'text-success' : 'text-destructive'}>
              {run.status}
            </span>{' '}
            · {run.timeMs} ms{run.exitCode !== null ? ` · exit ${run.exitCode}` : ''}
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          aria-label={open ? 'Collapse output' : 'Expand output'}
          onClick={() => setOpen(!open)}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>
      </div>
      {open && (
        <div className="h-44 overflow-auto border-t bg-muted/40">
          {tab === 'stdin' ? (
            <StdinEditor conn={conn} />
          ) : run ? (
            <pre className="p-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
              {run.stdout}
              {run.stderr && <span className="text-destructive">{run.stderr}</span>}
              {!run.stdout && !run.stderr && (
                <span className="text-muted-foreground">(no output)</span>
              )}
            </pre>
          ) : (
            <p className="p-3 text-sm text-muted-foreground">
              Run the code to see its output here.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StdinEditor({ conn }: { conn: RoomConnection }) {
  const ytext = getStdin(conn.doc);
  const [value, setValue] = useState(() => ytext.toString());
  useEffect(() => {
    const update = () => setValue(ytext.toString());
    ytext.observe(update);
    update();
    return () => ytext.unobserve(update);
  }, [ytext]);
  return (
    <Textarea
      aria-label="Program input"
      value={value}
      placeholder="Input passed to the program on stdin"
      maxLength={LIMITS.stdinBytes}
      onChange={(e) => applyTextDiff(ytext, e.target.value)}
      className="h-full resize-none rounded-none border-0 bg-transparent"
    />
  );
}
