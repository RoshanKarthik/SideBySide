import {
  DEFAULT_RUBRIC,
  RUBRIC_SCORE_LABELS,
  type Question,
  type QuestionSummary,
  type Room,
} from '@sidebyside/shared';
import {
  DOC_FIELDS,
  getHints,
  getRubric,
  getTimer,
  readProblem,
  readTimer,
  type RubricEntry,
} from '@sidebyside/shared/doc';
import { useMutation, useQuery } from '@tanstack/react-query';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  ArrowLeft,
  Check,
  Clock,
  Eye,
  Lightbulb,
  Pause,
  Play,
  RotateCcw,
  Search,
  UserPlus,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { Markdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import { Badge, ErrorNote, Spinner } from '@/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/components/ui/form';
import { api } from '@/lib/api';
import { useDocVersion } from '@/lib/use-doc';
import { cn, formatClock } from '@/lib/utils';
import { SignalList, type Signal } from './activity-feed';
import type { RoomConnection } from './use-room';
import type { PrivateDoc } from './use-private-doc';

type PanelTab = 'questions' | 'notes' | 'rubric' | 'activity';

interface Props {
  room: Room;
  slug: string;
  conn: RoomConnection;
  privateDoc: PrivateDoc | null;
  isOwner: boolean;
  user: { participantId: string; name: string; color: string; role: string };
  sessionStart: number;
  runningTestsFor: string | null;
  signals: Signal[];
}

/** The interviewer-only sidebar. Candidates never load it, and the server refuses them its data. */
export function InterviewerPanel(props: Props) {
  const [tab, setTab] = useState<PanelTab>('questions');
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <TimerControl privateDoc={props.privateDoc} />
        <span className="flex-1" />
        {props.isOwner && <InviteButton roomId={props.room.id} slug={props.slug} />}
      </div>
      {props.runningTestsFor && (
        <p className="flex items-center gap-2 border-b bg-accent/50 px-3 py-1.5 text-xs">
          <Spinner className="size-3" /> Running tests for {props.runningTestsFor} in your browser…
        </p>
      )}
      <nav role="tablist" aria-label="Interviewer tools" className="border-b p-2">
        <div className="grid grid-cols-4 rounded-lg bg-muted p-0.5">
          {(['questions', 'notes', 'rubric', 'activity'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                'h-7 rounded-md text-[13px] font-medium text-muted-foreground capitalize transition-colors hover:text-foreground',
                tab === t && 'bg-background text-foreground shadow-sm',
              )}
            >
              {t}
              {t === 'activity' && props.signals.length > 0 && (
                <span className="ml-1 rounded-full bg-warning/20 px-1 text-[10px] text-warning">
                  {props.signals.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'questions' && <QuestionsTab {...props} />}
        {tab === 'notes' &&
          (props.privateDoc ? (
            <PrivateNotes {...props} privateDoc={props.privateDoc} />
          ) : (
            <PanelLoading />
          ))}
        {tab === 'rubric' &&
          (props.privateDoc ? <Rubric privateDoc={props.privateDoc} /> : <PanelLoading />)}
        {tab === 'activity' && (
          <div className="p-3">
            <SignalCounts signals={props.signals} />
            <p className="mt-3 text-xs text-muted-foreground">
              Everyone in the room sees these signals. They show what happened, not why — ask before
              drawing conclusions.
            </p>
            <SignalList
              signals={props.signals}
              sessionStart={props.sessionStart}
              className="mt-3"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PanelLoading() {
  return (
    <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
      <Spinner /> Connecting…
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

function TimerControl({ privateDoc }: { privateDoc: PrivateDoc | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const doc = privateDoc?.doc;
  useDocVersionMaybe(doc);
  if (!doc) return <span className="text-sm text-muted-foreground">Timer</span>;
  const timer = readTimer(doc);
  const elapsed =
    timer.accumulatedMs + (timer.running && timer.startedAt ? now - timer.startedAt : 0);
  const map = getTimer(doc);
  const set = (fields: Record<string, unknown>) =>
    doc.transact(() => Object.entries(fields).forEach(([k, v]) => map.set(k, v)));

  return (
    <div className="flex items-center gap-1" aria-label="Interview timer">
      <Clock className="size-4 text-muted-foreground" />
      <span className="w-14 font-mono text-sm tabular-nums">{formatClock(elapsed)}</span>
      {timer.running ? (
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Pause timer"
          onClick={() => set({ running: false, startedAt: null, accumulatedMs: elapsed })}
        >
          <Pause />
        </Button>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Start timer"
          onClick={() => set({ running: true, startedAt: Date.now() })}
        >
          <Play />
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label="Reset timer"
        onClick={() => set({ running: false, startedAt: null, accumulatedMs: 0 })}
      >
        <RotateCcw />
      </Button>
    </div>
  );
}

// Hooks can't be conditional, so subscribe to a stable empty doc until the real one exists.
const EMPTY_DOC = new Y.Doc();
function useDocVersionMaybe(doc: PrivateDoc['doc'] | undefined) {
  return useDocVersion(doc ?? EMPTY_DOC);
}

// ---------------------------------------------------------------------------
// Invite
// ---------------------------------------------------------------------------

function InviteButton({ roomId, slug }: { roomId: string; slug: string }) {
  const [copied, setCopied] = useState(false);
  const invite = useMutation({
    mutationFn: () => api.json<{ link: string }>(`/rooms/${roomId}/invite`, { roomKey: slug }),
    onSuccess: async ({ link }) => {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
  });
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => invite.mutate()}
      disabled={invite.isPending}
      title="Copy a link that lets a signed-in colleague join as co-interviewer"
    >
      {copied ? <Check /> : <UserPlus />}
      {copied ? 'Link copied' : 'Invite'}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

function QuestionsTab({ room, slug, conn }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const list = useQuery({
    queryKey: ['questions'],
    queryFn: () => api.json<QuestionSummary[]>('/questions'),
  });
  useDocVersion(conn.doc);
  const active = readProblem(conn.doc)?.questionId ?? null;

  if (selected) {
    return (
      <QuestionDetail
        roomId={room.id}
        slug={slug}
        questionId={selected}
        active={active === selected}
        conn={conn}
        onBack={() => setSelected(null)}
      />
    );
  }

  const q = query.trim().toLowerCase();
  const items = (list.data ?? []).filter(
    (item) =>
      (!difficulty || item.difficulty === difficulty) &&
      (!q || item.title.toLowerCase().includes(q) || item.tags.some((t) => t.includes(q))),
  );

  return (
    <div className="p-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-2.5 left-2 size-4 text-muted-foreground" />
          <Input
            aria-label="Search questions"
            placeholder="Search title or tag"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <NativeSelect
          aria-label="Difficulty"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
        >
          <option value="">All</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </NativeSelect>
      </div>
      {list.isPending && <Spinner className="mt-4" />}
      {list.error && <ErrorNote>{list.error.message}</ErrorNote>}
      <ul className="mt-3 space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setSelected(item.id)}
              className={cn(
                'w-full rounded-md px-2 py-1.5 text-left hover:bg-muted',
                active === item.id && 'bg-accent',
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {item.title}
                {active === item.id && <Badge tone="live">showing</Badge>}
              </span>
              <span className="text-xs text-muted-foreground">
                {item.difficulty} · {item.mine ? 'my question' : 'public'} · {item.testCount} tests
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuestionDetail({
  roomId,
  slug,
  questionId,
  active,
  conn,
  onBack,
}: {
  roomId: string;
  slug: string;
  questionId: string;
  active: boolean;
  conn: RoomConnection;
  onBack: () => void;
}) {
  const question = useQuery({
    queryKey: ['room-question', roomId, questionId],
    queryFn: () =>
      api.json<Question>(`/rooms/${roomId}/questions/${questionId}`, { roomKey: slug }),
  });
  const show = useMutation({
    mutationFn: () =>
      api.json(`/rooms/${roomId}/questions/${questionId}/show`, { method: 'POST', roomKey: slug }),
  });
  const reveal = useMutation({
    mutationFn: (index: number) =>
      api.json(`/rooms/${roomId}/questions/${questionId}/hints/${index}/reveal`, {
        method: 'POST',
        roomKey: slug,
      }),
  });
  const revealed = new Set(
    active
      ? getHints(conn.doc)
          .toArray()
          .map((h) => h.index)
      : [],
  );

  return (
    <div className="p-3">
      <button
        type="button"
        onClick={onBack}
        className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> All questions
      </button>
      {question.isPending && <Spinner />}
      {question.error && <ErrorNote>{question.error.message}</ErrorNote>}
      {question.data && (
        <>
          <h3 className="font-semibold">{question.data.title}</h3>
          <p className="text-xs text-muted-foreground">
            {question.data.difficulty} · {question.data.testCount} tests (
            {question.data.hiddenTestCount} hidden)
          </p>
          <Button
            size="sm"
            className="mt-3 w-full"
            disabled={show.isPending}
            onClick={() => show.mutate()}
          >
            <Eye /> {active ? 'Show again (reload starter code)' : 'Show to candidate'}
          </Button>
          {show.error && <ErrorNote>{show.error.message}</ErrorNote>}
          {question.data.hints.length > 0 && (
            <section className="mt-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase">Hints</h4>
              <ol className="mt-1 space-y-2">
                {question.data.hints.map((hint, i) => (
                  <li key={i} className="rounded-md border p-2 text-sm">
                    <p>{hint}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={!active || revealed.has(i) || reveal.isPending}
                      title={active ? undefined : 'Show the question first'}
                      onClick={() => reveal.mutate(i)}
                    >
                      <Lightbulb /> {revealed.has(i) ? 'Revealed' : 'Reveal hint'}
                    </Button>
                  </li>
                ))}
              </ol>
              {reveal.error && <ErrorNote>{reveal.error.message}</ErrorNote>}
            </section>
          )}
          <section className="mt-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase">Statement</h4>
            <Markdown className="mt-1 text-[13px]">{question.data.descriptionMd}</Markdown>
          </section>
          <section className="mt-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase">Tests</h4>
            <ul className="mt-1 space-y-1 font-mono text-xs">
              {question.data.testCases.map((t, i) => (
                <li key={t.id} className="rounded bg-muted p-1.5">
                  <span className="font-sans font-medium">
                    #{i + 1} {t.isHidden ? '(hidden)' : ''}
                  </span>
                  <pre className="max-h-16 overflow-hidden whitespace-pre-wrap">
                    {t.stdin.slice(0, 200)}
                    {t.stdin.length > 200 ? '…' : ''}
                  </pre>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Private notes
// ---------------------------------------------------------------------------

function PrivateNotes({ privateDoc, user, sessionStart }: Props & { privateDoc: PrivateDoc }) {
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({
          placeholder: 'Private notes: only interviewers can see these.',
        }),
        Collaboration.configure({ document: privateDoc.doc, field: DOC_FIELDS.notes }),
        CollaborationCaret.configure({ provider: privateDoc.provider, user }),
      ],
      editorProps: { attributes: { 'aria-label': 'Private interviewer notes' } },
    },
    [privateDoc.doc, privateDoc.provider],
  );

  const stamp = () => {
    if (!editor) return;
    const offsetMs = Math.max(0, Date.now() - sessionStart);
    editor
      .chain()
      .focus()
      .insertContent(`[${formatClock(offsetMs)}] `)
      .run();
    privateDoc.provider.sendMessage(
      JSON.stringify({
        kind: 'event',
        event: { type: 'note_timestamp', payload: { offsetMs, text: '' } },
      }),
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <Button size="sm" variant="outline" onClick={stamp} title="Insert the current session time">
          <Clock /> Timestamp
        </Button>
        <span className="text-xs text-muted-foreground">Not visible to the candidate</span>
      </div>
      <div className="notes-editor min-h-0 flex-1 overflow-y-auto text-sm">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rubric
// ---------------------------------------------------------------------------

function Rubric({ privateDoc }: { privateDoc: PrivateDoc }) {
  useDocVersion(privateDoc.doc);
  const rubric = getRubric(privateDoc.doc);
  const update = (criterion: string, patch: Partial<RubricEntry>) => {
    const current = rubric.get(criterion) ?? { score: null, comment: '' };
    rubric.set(criterion, { ...current, ...patch });
  };
  return (
    <div className="space-y-4 p-3">
      <p className="text-xs text-muted-foreground">
        Scores are shared with co-interviewers and saved when the session ends.
      </p>
      {DEFAULT_RUBRIC.map((criterion) => {
        const entry = rubric.get(criterion) ?? { score: null, comment: '' };
        return (
          <fieldset key={criterion}>
            <legend className="text-sm font-medium">{criterion}</legend>
            <div className="mt-1 flex gap-1" role="radiogroup" aria-label={criterion}>
              {[1, 2, 3, 4].map((score) => (
                <button
                  key={score}
                  type="button"
                  role="radio"
                  aria-checked={entry.score === score}
                  title={RUBRIC_SCORE_LABELS[score]}
                  onClick={() => update(criterion, { score: entry.score === score ? null : score })}
                  className={cn(
                    'flex-1 rounded-md border py-1 text-sm hover:bg-muted',
                    entry.score === score &&
                      'border-primary bg-primary text-primary-foreground hover:bg-primary',
                  )}
                >
                  {score}
                </button>
              ))}
            </div>
            <Textarea
              aria-label={`${criterion} comment`}
              placeholder="Comment"
              rows={2}
              value={entry.comment}
              maxLength={2000}
              onChange={(e) => update(criterion, { comment: e.target.value })}
              className="mt-1 font-sans text-sm"
            />
          </fieldset>
        );
      })}
    </div>
  );
}

function SignalCounts({ signals }: { signals: Signal[] }) {
  const count = (kind: Signal['kind']) => signals.filter((s) => s.kind === kind).length;
  const items = [
    { label: 'Pastes', value: count('paste') },
    { label: 'Large inserts', value: count('large_insert') },
    { label: 'Tab hidden', value: count('tab_hidden') },
    { label: 'Left window', value: count('window_blur') },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2">
      {items.map((i) => (
        <div key={i.label} className="rounded-lg border bg-background/60 px-3 py-2">
          <dt className="text-[11px] text-muted-foreground">{i.label}</dt>
          <dd className="font-mono text-lg font-semibold tabular-nums">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
