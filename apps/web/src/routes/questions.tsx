import { DIFFICULTIES, type Question, type QuestionSummary } from '@sidebyside/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { AppShell } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge, Card, ErrorNote, Spinner } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/form';
import { api } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

type Scope = 'all' | 'mine' | 'public';

export default function QuestionsPage() {
  const { data: session, isPending } = useSession();
  const [scope, setScope] = useState<Scope>('all');
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const list = useQuery({
    // Same key as the room's question picker, so edits here show up there.
    queryKey: ['questions'],
    queryFn: () => api.json<QuestionSummary[]>('/questions'),
    enabled: !!session,
  });

  if (isPending) return null;
  if (!session) return <Navigate to="/login?next=/questions" replace />;

  const q = query.trim().toLowerCase();
  const items = (list.data ?? []).filter(
    (item) =>
      (scope === 'all' || (scope === 'mine' ? item.mine : !item.mine)) &&
      (!difficulty || item.difficulty === difficulty) &&
      (!q ||
        item.title.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q))),
  );
  const mineCount = list.data?.filter((i) => i.mine).length ?? 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Question bank</h1>
            <p className="text-sm text-muted-foreground">
              Your questions plus the public practice bank. Duplicate a public question to edit it.
            </p>
          </div>
          <Button asChild>
            <Link to="/questions/new">
              <Plus /> New question
            </Link>
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Show" className="flex rounded-md border p-0.5">
            {(
              [
                ['all', 'All'],
                ['mine', `Mine (${mineCount})`],
                ['public', 'Public'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={scope === value}
                onClick={() => setScope(value)}
                className={cn(
                  'rounded px-3 py-1 text-sm',
                  scope === value ? 'bg-muted font-medium' : 'text-muted-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative min-w-48 flex-1">
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
            <option value="">All difficulties</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d[0]!.toUpperCase() + d.slice(1)}
              </option>
            ))}
          </NativeSelect>
        </div>

        {list.isPending && <Spinner className="mt-10" />}
        {list.error && <ErrorNote>{list.error.message}</ErrorNote>}
        {list.data && items.length === 0 && (
          <Card className="mt-6 p-8 text-center text-muted-foreground">
            {scope === 'mine' && !q && !difficulty
              ? 'You have no questions yet. Create one, or duplicate one from the public bank.'
              : 'No questions match.'}
          </Card>
        )}
        <ul className="mt-6 grid gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <QuestionRow item={item} />
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}

const DIFFICULTY_TONE = { easy: 'success', medium: 'info', hard: 'danger' } as const;

function QuestionRow({ item }: { item: QuestionSummary }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const duplicate = useMutation({
    mutationFn: () => api.json<Question>(`/questions/${item.id}/duplicate`, { method: 'POST' }),
    onSuccess: (copy) => {
      void queryClient.invalidateQueries({ queryKey: ['questions'] });
      navigate(`/questions/${copy.id}`);
    },
  });

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/questions/${item.id}`} className="truncate font-medium hover:underline">
            {item.title}
          </Link>
          <Badge tone={DIFFICULTY_TONE[item.difficulty]}>{item.difficulty}</Badge>
          {!item.mine && <Badge>public</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {item.tags.length > 0 && `${item.tags.join(', ')} · `}
          {item.testCount} tests
          {item.mine && item.hiddenTestCount > 0 && ` (${item.hiddenTestCount} hidden)`} ·{' '}
          {item.hintCount} hints
        </p>
        {duplicate.error && <ErrorNote>{duplicate.error.message}</ErrorNote>}
      </div>
      <div className="flex gap-2">
        {!item.mine && (
          <Button
            size="sm"
            variant="outline"
            disabled={duplicate.isPending}
            onClick={() => duplicate.mutate()}
          >
            {duplicate.isPending ? <Spinner /> : <Copy />} Duplicate
          </Button>
        )}
        <Button size="sm" variant={item.mine ? 'default' : 'outline'} asChild>
          <Link to={`/questions/${item.id}`}>{item.mine ? 'Edit' : 'View'}</Link>
        </Button>
      </div>
    </Card>
  );
}
