import { Suspense, lazy } from 'react';
import { cn } from '@/lib/utils';

// The parser is ~45 KB gzipped; the room page loads it only once a problem is shown.
const MarkdownRenderer = lazy(() => import('./markdown-renderer'));

/** Renders markdown from questions and reports, showing the plain text until the parser loads. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('markdown', className)}>
      <Suspense fallback={<p className="whitespace-pre-wrap">{children}</p>}>
        <MarkdownRenderer>{children}</MarkdownRenderer>
      </Suspense>
    </div>
  );
}
