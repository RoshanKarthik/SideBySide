import { getHints, readProblem } from '@sidebyside/shared/doc';
import { ChevronDown, ChevronRight, Lightbulb } from 'lucide-react';
import { useState } from 'react';
import type * as Y from 'yjs';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/card';
import { useDocVersion } from '@/lib/use-doc';

const DIFFICULTY_TONE = { easy: 'success', medium: 'info', hard: 'danger' } as const;

/** The question the interviewer is showing, with any hints they've revealed. */
export function ProblemPanel({ doc }: { doc: Y.Doc }) {
  // Re-render on every document change; reading these fields is cheap.
  useDocVersion(doc);
  const problem = readProblem(doc);
  const hints = getHints(doc).toArray();
  const [open, setOpen] = useState(true);

  if (!problem) return null;
  const tone = DIFFICULTY_TONE[problem.difficulty as keyof typeof DIFFICULTY_TONE] ?? 'neutral';

  return (
    <section aria-label="Problem" className="border-b bg-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <span className="font-semibold">{problem.title}</span>
        <Badge tone={tone}>{problem.difficulty}</Badge>
        {hints.length > 0 && (
          <Badge tone="info">
            <Lightbulb className="size-3" /> {hints.length} hint{hints.length === 1 ? '' : 's'}
          </Badge>
        )}
      </button>
      {open && (
        <div className="max-h-[38vh] overflow-y-auto px-4 pb-3">
          <Markdown>{problem.descriptionMd}</Markdown>
          {hints.length > 0 && (
            <ol className="mt-3 space-y-1.5">
              {[...hints]
                .sort((a, b) => a.index - b.index)
                .map((h) => (
                  <li
                    key={h.index}
                    className="flex gap-2 rounded-md bg-accent/60 px-3 py-2 text-sm"
                  >
                    <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span>
                      <span className="font-medium">Hint {h.index + 1}: </span>
                      {h.text}
                    </span>
                  </li>
                ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
