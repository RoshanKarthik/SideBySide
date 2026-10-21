import {
  DIFFICULTIES,
  LANGUAGES,
  LANGUAGE_INFO,
  QUESTION_LIMITS,
  questionInputSchema,
  type Difficulty,
  type Lang,
  type Question,
  type QuestionInput,
} from '@sidebyside/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, EyeOff, Plus, Save, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useParams } from 'react-router';
import { Link, useNavigate } from '@/lib/navigation';
import { AppShell } from '@/components/layout';
import { Markdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import { Badge, Card, ErrorNote, Spinner } from '@/components/ui/card';
import { Checkbox, Input, Label, NativeSelect, Textarea } from '@/components/ui/form';
import { api } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

interface DraftTest {
  key: number;
  stdin: string;
  expectedStdout: string;
  isHidden: boolean;
  weight: number;
}

interface Draft {
  title: string;
  descriptionMd: string;
  difficulty: Difficulty;
  tags: string;
  hints: string[];
  starterCode: Partial<Record<Lang, string>>;
  testCases: DraftTest[];
}

let nextKey = 1;

function emptyDraft(): Draft {
  return {
    title: '',
    descriptionMd: '',
    difficulty: 'easy',
    tags: '',
    hints: [],
    starterCode: {},
    testCases: [],
  };
}

function toDraft(q: Question): Draft {
  return {
    title: q.title,
    descriptionMd: q.descriptionMd,
    difficulty: q.difficulty,
    tags: q.tags.join(', '),
    hints: q.hints,
    starterCode: q.starterCode as Partial<Record<Lang, string>>,
    testCases: q.testCases.map((t) => ({ ...t, key: nextKey++ })),
  };
}

function toInput(d: Draft): QuestionInput {
  const starterCode: Partial<Record<Lang, string>> = {};
  for (const lang of LANGUAGES) {
    const code = d.starterCode[lang];
    if (code?.trim()) starterCode[lang] = code;
  }
  return {
    title: d.title,
    descriptionMd: d.descriptionMd,
    difficulty: d.difficulty,
    tags: d.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    hints: d.hints.map((h) => h.trim()).filter(Boolean),
    starterCode,
    testCases: d.testCases.map(({ stdin, expectedStdout, isHidden, weight }) => ({
      stdin,
      expectedStdout,
      isHidden,
      weight,
    })),
  };
}

/** `/questions/new` and `/questions/:id`: edit your own question, or view a public one. */
export default function QuestionEditPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const { data: session, isPending } = useSession();
  const question = useQuery({
    queryKey: ['question', id],
    queryFn: () => api.json<Question>(`/questions/${id}`),
    enabled: !!session && !isNew,
  });

  if (isPending) return null;
  if (!session) {
    const next = isNew ? '/questions/new' : `/questions/${id}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
        <Link
          to="/questions"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Question bank
        </Link>
        {isNew ? (
          <QuestionForm key="new" initial={emptyDraft()} />
        ) : question.isPending ? (
          <Spinner className="mt-10" />
        ) : question.error ? (
          <div className="mt-6">
            <ErrorNote>{question.error.message}</ErrorNote>
          </div>
        ) : question.data.mine ? (
          <QuestionForm
            key={question.data.id}
            id={question.data.id}
            initial={toDraft(question.data)}
          />
        ) : (
          <PublicQuestion question={question.data} />
        )}
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Public (read-only) view
// ---------------------------------------------------------------------------

function PublicQuestion({ question }: { question: Question }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const duplicate = useMutation({
    mutationFn: () => api.json<Question>(`/questions/${question.id}/duplicate`, { method: 'POST' }),
    onSuccess: (copy) => {
      void queryClient.invalidateQueries({ queryKey: ['questions'] });
      navigate(`/questions/${copy.id}`, { replace: true });
    },
  });
  const starters = LANGUAGES.filter((l) => question.starterCode[l]);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{question.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge>public</Badge>
            {question.difficulty}
            {question.tags.length > 0 && ` · ${question.tags.join(', ')}`}
          </div>
        </div>
        <Button disabled={duplicate.isPending} onClick={() => duplicate.mutate()}>
          {duplicate.isPending ? <Spinner /> : <Copy />} Duplicate to my bank
        </Button>
      </div>
      {duplicate.error && <ErrorNote>{duplicate.error.message}</ErrorNote>}
      <Card className="mt-6 p-5">
        <Markdown>{question.descriptionMd}</Markdown>
      </Card>
      {question.hints.length > 0 && (
        <Section title="Hints">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {question.hints.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ol>
        </Section>
      )}
      {starters.length > 0 && (
        <Section title="Starter code">
          <p className="text-sm text-muted-foreground">
            {starters.map((l) => LANGUAGE_INFO[l].label).join(', ')}
          </p>
        </Section>
      )}
      <Section title={`Tests (${question.testCount})`}>
        <p className="text-sm text-muted-foreground">
          {question.hiddenTestCount > 0 &&
            `${question.hiddenTestCount} hidden tests are not shown here; duplicating the question copies them into your bank. `}
        </p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {question.testCases.map((t, i) => (
            <li key={t.id} className="rounded-md border p-3 font-mono text-xs">
              <p className="mb-1 font-sans font-medium">Test {i + 1}</p>
              <pre className="whitespace-pre-wrap">{t.stdin}</pre>
              <p className="mt-1 font-sans text-muted-foreground">Expected</p>
              <pre className="whitespace-pre-wrap">{t.expectedStdout}</pre>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function QuestionForm({ id, initial }: { id?: string; initial: Draft }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const [preview, setPreview] = useState(false);
  const [starterLang, setStarterLang] = useState<Lang>('python');
  const [invalid, setInvalid] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  };
  const updateTest = (key: number, patch: Partial<DraftTest>) =>
    update({ testCases: draft.testCases.map((t) => (t.key === key ? { ...t, ...patch } : t)) });

  const save = useMutation({
    mutationFn: (input: QuestionInput) =>
      id
        ? api.json<Question>(`/questions/${id}`, { method: 'PATCH', body: input })
        : api.json<Question>('/questions', { method: 'POST', body: input }),
    onSuccess: (q) => {
      void queryClient.invalidateQueries({ queryKey: ['questions'] });
      queryClient.setQueryData(['question', q.id], q);
      setSaved(true);
      if (!id) navigate(`/questions/${q.id}`, { replace: true });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.send(`/questions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['questions'] });
      navigate('/questions', { replace: true });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const input = toInput(draft);
    const parsed = questionInputSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      setInvalid(`${issue.path.join(' › ') || 'Question'}: ${issue.message}`);
      return;
    }
    setInvalid(null);
    save.mutate(input);
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{id ? 'Edit question' : 'New question'}</h1>
        <div className="flex items-center gap-2">
          {saved && <span className="text-sm text-success">Saved</span>}
          {id && (
            <Button
              type="button"
              variant="outline"
              disabled={remove.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete "${draft.title || 'this question'}"? This can't be undone.`,
                  )
                )
                  remove.mutate();
              }}
            >
              <Trash2 /> Delete
            </Button>
          )}
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Spinner /> : <Save />} Save
          </Button>
        </div>
      </div>
      {(invalid || save.error || remove.error) && (
        <ErrorNote>{invalid ?? save.error?.message ?? remove.error?.message}</ErrorNote>
      )}

      <Card className="space-y-4 p-5">
        <div className="space-y-1.5">
          <Label htmlFor="q-title">Title</Label>
          <Input
            id="q-title"
            required
            maxLength={QUESTION_LIMITS.title}
            value={draft.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Two Sum"
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="q-difficulty">Difficulty</Label>
            <NativeSelect
              id="q-difficulty"
              value={draft.difficulty}
              onChange={(e) => update({ difficulty: e.target.value as Difficulty })}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d[0]!.toUpperCase() + d.slice(1)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="min-w-60 flex-1 space-y-1.5">
            <Label htmlFor="q-tags">Tags (comma separated)</Label>
            <Input
              id="q-tags"
              value={draft.tags}
              onChange={(e) => update({ tags: e.target.value })}
              placeholder="arrays, hashing"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="q-description">Description (markdown)</Label>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPreview((p) => !p)}>
              {preview ? 'Edit' : 'Preview'}
            </Button>
          </div>
          {preview ? (
            <div className="min-h-48 rounded-md border p-3">
              <Markdown>{draft.descriptionMd || '_Nothing yet._'}</Markdown>
            </div>
          ) : (
            <Textarea
              id="q-description"
              rows={12}
              maxLength={QUESTION_LIMITS.description}
              value={draft.descriptionMd}
              onChange={(e) => update({ descriptionMd: e.target.value })}
              placeholder={'Given an array of integers…\n\n### Input\n…\n\n### Output\n…'}
            />
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Hints</h2>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={draft.hints.length >= QUESTION_LIMITS.hints}
            onClick={() => update({ hints: [...draft.hints, ''] })}
          >
            <Plus /> Add hint
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">Revealed to the candidate one at a time.</p>
        <ol className="mt-3 space-y-2">
          {draft.hints.map((hint, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-2 w-5 text-sm text-muted-foreground">{i + 1}.</span>
              <Textarea
                aria-label={`Hint ${i + 1}`}
                rows={2}
                className="font-sans"
                maxLength={QUESTION_LIMITS.hint}
                value={hint}
                onChange={(e) =>
                  update({ hints: draft.hints.map((h, j) => (j === i ? e.target.value : h)) })
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove hint ${i + 1}`}
                onClick={() => update({ hints: draft.hints.filter((_, j) => j !== i) })}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">Starter code</h2>
        <p className="text-sm text-muted-foreground">
          Loaded into the editor when you show the question. Leave a language empty to keep the
          room's default.
        </p>
        <div
          role="tablist"
          aria-label="Starter code language"
          className="mt-3 flex flex-wrap gap-1"
        >
          {LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              role="tab"
              aria-selected={starterLang === lang}
              onClick={() => setStarterLang(lang)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-sm',
                starterLang === lang
                  ? 'border-primary bg-accent font-medium'
                  : 'text-muted-foreground',
              )}
            >
              {LANGUAGE_INFO[lang].label}
              {draft.starterCode[lang]?.trim() ? ' ●' : ''}
            </button>
          ))}
        </div>
        <Textarea
          aria-label={`${LANGUAGE_INFO[starterLang].label} starter code`}
          rows={10}
          spellCheck={false}
          className="mt-2"
          maxLength={QUESTION_LIMITS.starter}
          value={draft.starterCode[starterLang] ?? ''}
          onChange={(e) =>
            update({ starterCode: { ...draft.starterCode, [starterLang]: e.target.value } })
          }
          onKeyDown={(e) => {
            // Tab inserts indentation instead of leaving the field.
            if (e.key !== 'Tab' || e.shiftKey) return;
            e.preventDefault();
            const el = e.currentTarget;
            el.setRangeText('    ', el.selectionStart, el.selectionEnd, 'end');
            update({ starterCode: { ...draft.starterCode, [starterLang]: el.value } });
          }}
        />
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Test cases</h2>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={draft.testCases.length >= QUESTION_LIMITS.testCases}
            onClick={() =>
              update({
                testCases: [
                  ...draft.testCases,
                  { key: nextKey++, stdin: '', expectedStdout: '', isHidden: false, weight: 1 },
                ],
              })
            }
          >
            <Plus /> Add test
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Code gets the input on stdin; output is compared ignoring trailing whitespace. Candidates
          only see pass/fail for hidden tests, never their contents.
        </p>
        <ol className="mt-3 space-y-3">
          {draft.testCases.map((t, i) => (
            <li key={t.key} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium">Test {i + 1}</span>
                {t.isHidden && (
                  <Badge>
                    <EyeOff className="size-3" /> hidden
                  </Badge>
                )}
                <span className="flex-1" />
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`hidden-${t.key}`}
                    checked={t.isHidden}
                    onCheckedChange={(v) => updateTest(t.key, { isHidden: v === true })}
                  />
                  <Label htmlFor={`hidden-${t.key}`} className="font-normal">
                    Hidden
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`weight-${t.key}`} className="font-normal">
                    Weight
                  </Label>
                  <Input
                    id={`weight-${t.key}`}
                    type="number"
                    min={1}
                    max={100}
                    className="w-16"
                    value={t.weight}
                    onChange={(e) => updateTest(t.key, { weight: Number(e.target.value) || 1 })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove test ${i + 1}`}
                  onClick={() =>
                    update({ testCases: draft.testCases.filter((x) => x.key !== t.key) })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`stdin-${t.key}`} className="text-xs text-muted-foreground">
                    Input (stdin)
                  </Label>
                  <Textarea
                    id={`stdin-${t.key}`}
                    rows={3}
                    spellCheck={false}
                    value={t.stdin}
                    onChange={(e) => updateTest(t.key, { stdin: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`expected-${t.key}`} className="text-xs text-muted-foreground">
                    Expected output
                  </Label>
                  <Textarea
                    id={`expected-${t.key}`}
                    rows={3}
                    spellCheck={false}
                    value={t.expectedStdout}
                    onChange={(e) => updateTest(t.key, { expectedStdout: e.target.value })}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Spinner /> : <Save />} Save
        </Button>
      </div>
    </form>
  );
}
