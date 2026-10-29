import {
  LANGUAGES,
  LANGUAGE_INFO,
  LIMITS,
  hasPreview,
  isRunnable,
  runsOnServer,
  type Lang,
  type Participant,
  type SharedRun,
  type TestRun,
} from '@sidebyside/shared';
import {
  getCodeMap,
  getMeta,
  getStdin,
  readActiveLanguage,
  readProblem,
} from '@sidebyside/shared/doc';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Loader2,
  Lock,
  LockOpen,
  Play,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MonacoBinding } from 'y-monaco';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { NativeSelect, Textarea } from '@/components/ui/form';
import { useDocVersion } from '@/lib/use-doc';
import { cn } from '@/lib/utils';
import { reportPaste } from '@/room/integrity';
import { ProblemPanel } from '@/room/problem-panel';
import type { RoomConnection } from '@/room/use-room';
import { CodeRunner, type RunPhase } from '@/runner/runner';
import { serverRunner } from '@/runner/server-run';
import { monaco, monacoTheme } from './monaco';
import { PreviewPane } from './preview-pane';
import { remoteCursorCss } from './remote-cursors';
import { applyTextDiff } from './text-binding';

export default function CodePanel({
  conn,
  participant,
  interviewer,
  roomId,
  slug,
}: {
  conn: RoomConnection;
  participant: Participant;
  interviewer: boolean;
  roomId: string;
  /** Room slug: the key for a guest's token. */
  slug: string;
}) {
  useDocVersion(conn.doc);
  const language = readActiveLanguage(conn.doc);
  // Candidates can't type while the interviewer has locked the editor (the server also
  // refuses their edits).
  const readOnly = conn.locked && !interviewer;
  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);

  // One editor instance, created when its container mounts; one model per language so
  // switching keeps each buffer's undo state.
  const hostRef = useCallback((host: HTMLDivElement | null) => {
    if (!host) return;
    const instance = monaco.editor.create(host, {
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      fontFamily: "'Geist Mono Variable', 'Cascadia Code', Consolas, monospace",
      fontLigatures: true,
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

  // Pastes are activity signals everyone in the room sees.
  useEffect(() => {
    if (!editor) return;
    const sub = editor.onDidPaste((e) => {
      const text = editor.getModel()?.getValueInRange(e.range) ?? '';
      reportPaste(conn, 'code', text);
    });
    return () => sub.dispose();
  }, [editor, conn.doc, conn.provider]); // eslint-disable-line react-hooks/exhaustive-deps -- conn is rebuilt every render; doc and provider identify it.

  useEffect(() => {
    editor?.updateOptions({
      readOnly,
      readOnlyMessage: { value: 'The interviewer has locked the editor.' },
    });
  }, [editor, readOnly]);

  const preview = hasPreview(language);
  const previewText = preview ? getCodeMap(conn.doc).get(language) : undefined;

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
      <ProblemPanel doc={conn.doc} />
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5">
        <label htmlFor="language" className="sr-only">
          Language
        </label>
        <NativeSelect
          id="language"
          value={language}
          onChange={(e) => changeLanguage(e.target.value as Lang)}
          disabled={readOnly}
          className="h-8"
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_INFO[l].label}
              {LANGUAGE_INFO[l].runsOn ? '' : hasPreview(l) ? ' (live preview)' : ' (edit only)'}
            </option>
          ))}
        </NativeSelect>
        {interviewer ? (
          <Button
            size="sm"
            variant="outline"
            aria-pressed={conn.locked}
            onClick={() => conn.send({ kind: 'set_lock', locked: !conn.locked })}
            title={
              conn.locked
                ? 'Let the candidate edit again'
                : 'Make the room read-only for the candidate'
            }
          >
            {conn.locked ? <Lock /> : <LockOpen />}
            {conn.locked ? 'Locked' : 'Lock editor'}
          </Button>
        ) : (
          conn.locked && (
            <Badge tone="info">
              <Lock className="size-3" /> Locked by the interviewer
            </Badge>
          )
        )}
        <span className="flex-1" />
        {!preview && <RunTestsButton conn={conn} language={language} />}
        {!preview && (
          <RunControls
            conn={conn}
            participant={participant}
            language={language}
            roomId={roomId}
            slug={slug}
          />
        )}
      </div>
      <div className={cn('min-h-0 flex-1', preview && 'grid grid-cols-2 max-md:grid-cols-1')}>
        <div className="relative h-full min-h-0">
          <div ref={hostRef} className="absolute inset-0" aria-label="Code editor" />
        </div>
        {preview && previewText && (
          <PreviewPane key={language} text={previewText} className="border-l max-md:border-t" />
        )}
      </div>
      {!preview && <OutputDrawer conn={conn} readOnly={readOnly} />}
    </div>
  );
}

function RunControls({
  conn,
  participant,
  language,
  roomId,
  slug,
}: {
  conn: RoomConnection;
  participant: Participant;
  language: Lang;
  roomId: string;
  slug: string;
}) {
  const runner = useMemo(() => new CodeRunner(serverRunner(roomId, slug)), [roomId, slug]);
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
        !runnable
          ? `${LANGUAGE_INFO[language].label} can be edited but not run`
          : runsOnServer(language)
            ? 'Compile and run the code on the code runner (takes a few seconds)'
            : 'Run the code'
      }
    >
      {phase ? <Loader2 className="animate-spin" /> : <Play />}
      {phase === 'loading'
        ? 'Loading Python…'
        : phase === 'running'
          ? runsOnServer(language)
            ? 'Compiling and running…'
            : 'Running…'
          : 'Run'}
    </Button>
  );
}

function RunTestsButton({ conn, language }: { conn: RoomConnection; language: Lang }) {
  const problem = readProblem(conn.doc);
  if (!problem) return null;
  const runnable = isRunnable(language);
  const pending = conn.pendingTestRequest !== null;
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={!runnable || pending}
      onClick={() => conn.requestTests(problem.questionId, language)}
      title={
        runnable
          ? 'Run the question’s tests, including hidden ones'
          : 'Tests can only run for Python, JavaScript and TypeScript'
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <FlaskConical />}
      {pending ? 'Testing…' : 'Run tests'}
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

type DrawerTab = 'output' | 'tests' | 'stdin';
const DRAWER_TABS: { id: DrawerTab; label: string }[] = [
  { id: 'output', label: 'Output' },
  { id: 'tests', label: 'Tests' },
  { id: 'stdin', label: 'Input (stdin)' },
];

function OutputDrawer({ conn, readOnly }: { conn: RoomConnection; readOnly: boolean }) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<DrawerTab>('output');
  const run = conn.lastRun;
  const testRun = conn.lastTestRun;
  // A new run or test run (from anyone) brings its results into view.
  const [shownRunId, setShownRunId] = useState(run?.runId);
  if (run && run.runId !== shownRunId) {
    setShownRunId(run.runId);
    setOpen(true);
    setTab('output');
  }
  const [shownTestId, setShownTestId] = useState(testRun?.requestId);
  if (testRun && testRun.requestId !== shownTestId) {
    setShownTestId(testRun.requestId);
    setOpen(true);
    setTab('tests');
  }

  return (
    <div className="border-t">
      <div className="flex items-center gap-1 px-2">
        {DRAWER_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setOpen(true);
            }}
            className={cn(
              'px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground',
              open && tab === t.id && 'text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
        {tab === 'output' && run && (
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
        <div className="h-48 overflow-auto border-t bg-muted/40">
          {tab === 'stdin' ? (
            <StdinEditor conn={conn} readOnly={readOnly} />
          ) : tab === 'tests' ? (
            <TestResults
              run={testRun}
              pending={conn.pendingTestRequest !== null}
              error={conn.testError}
            />
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

function TestResults({
  run,
  pending,
  error,
}: {
  run: TestRun | null;
  pending: boolean;
  error: string | null;
}) {
  if (pending) {
    return (
      <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Running the tests in the interviewer’s browser…
      </p>
    );
  }
  if (error && !run) return <p className="p-3 text-sm text-destructive">{error}</p>;
  if (!run) {
    return (
      <p className="p-3 text-sm text-muted-foreground">
        Run the tests to check the solution against the question’s test cases.
      </p>
    );
  }
  const allPassed = run.passed === run.total;
  return (
    <div className="p-3 text-sm">
      {error && <p className="mb-2 text-destructive">{error}</p>}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <ScoreBadge score={run.score} />
        <span className={cn('font-medium', allPassed ? 'text-success' : 'text-destructive')}>
          {run.passed} / {run.total} tests passed
        </span>
        <span className="text-muted-foreground">
          {LANGUAGE_INFO[run.language].label} · requested by {run.requestedBy}
        </span>
      </p>
      <ul className="mt-2 space-y-1">
        {run.results.map((r) => (
          <li key={r.index} className="rounded-md border bg-background px-2 py-1.5">
            <details>
              <summary className="flex cursor-pointer items-center gap-2">
                {r.status === 'passed' ? (
                  <CheckCircle2 className="size-4 text-success" />
                ) : (
                  <XCircle className="size-4 text-destructive" />
                )}
                Test {r.index + 1}
                {r.hidden && <Badge>hidden</Badge>}
                <span className="text-muted-foreground">
                  {r.status} · {r.timeMs} ms
                </span>
              </summary>
              {r.stdin !== undefined ? (
                <div className="mt-2 grid gap-2 font-mono text-xs sm:grid-cols-3">
                  <IoBlock label="Input" text={r.stdin} />
                  <IoBlock label="Expected" text={r.expectedStdout ?? ''} />
                  <IoBlock
                    label="Actual"
                    text={(r.actualStdout ?? '') + (r.stderr ? `\n${r.stderr}` : '')}
                  />
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Hidden test: its input and expected output are not shown.
                </p>
              )}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScoreBadge({ score, className }: { score: number; className?: string }) {
  const tone =
    score >= 80
      ? 'border-success/30 bg-success/10 text-success'
      : score >= 50
        ? 'border-warning/30 bg-warning/10 text-warning'
        : 'border-destructive/30 bg-destructive/10 text-destructive';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums',
        tone,
        className,
      )}
      title="Weighted test score out of 100"
    >
      {score}/100
    </span>
  );
}

function IoBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="mb-1 font-sans text-[11px] font-medium text-muted-foreground uppercase">
        {label}
      </p>
      <pre className="max-h-32 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap">
        {text === '' ? '(empty)' : text}
      </pre>
    </div>
  );
}

function StdinEditor({ conn, readOnly }: { conn: RoomConnection; readOnly: boolean }) {
  const ytext = getStdin(conn.doc);
  useDocVersion(conn.doc);
  return (
    <Textarea
      aria-label="Program input"
      value={ytext.toString()}
      placeholder="Input passed to the program on stdin"
      maxLength={LIMITS.stdinBytes}
      readOnly={readOnly}
      onChange={(e) => applyTextDiff(ytext, e.target.value)}
      className="h-full resize-none rounded-none border-0 bg-transparent"
    />
  );
}
