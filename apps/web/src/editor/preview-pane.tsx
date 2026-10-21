import { RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** How long typing has to pause before the preview reloads. */
const RELOAD_DELAY_MS = 500;
const MAX_CONSOLE_LINES = 50;

/**
 * Forwards console output and uncaught errors from the page to the preview's console.
 * Injected first, so it sees everything the page logs.
 */
const CONSOLE_BRIDGE = `<script>(() => {
  const send = (level, args) => {
    try {
      parent.postMessage({ sbsPreview: true, level, text: args.map((a) => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch { return String(a); }
      }).join(' ') }, '*');
    } catch {}
  };
  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => { send(level, args); original(...args); };
  }
  addEventListener('error', (e) => send('error', [e.message]));
  addEventListener('unhandledrejection', (e) => send('error', [String(e.reason)]));
})();</script>`;

interface ConsoleLine {
  id: number;
  level: string;
  text: string;
}

/**
 * Renders HTML, CSS and JavaScript live in a sandboxed frame. The frame has an opaque origin
 * (no allow-same-origin), so the page can't reach this app's cookies, storage or DOM.
 */
export function PreviewPane({ text, className }: { text: Y.Text; className?: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState(() => text.toString());
  const [reloads, setReloads] = useState(0);
  const [lines, setLines] = useState<ConsoleLine[]>([]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setLines([]);
        setHtml(text.toString());
      }, RELOAD_DELAY_MS);
    };
    text.observe(onChange);
    return () => {
      clearTimeout(timer);
      text.unobserve(onChange);
    };
  }, [text]);

  useEffect(() => {
    let next = 0;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const data = e.data as { sbsPreview?: boolean; level?: unknown; text?: unknown };
      if (!data?.sbsPreview) return;
      const line = {
        id: next++,
        level: String(data.level),
        text: String(data.text).slice(0, 2_000),
      };
      setLines((prev) => [...prev.slice(-(MAX_CONSOLE_LINES - 1)), line]);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const srcDoc = CONSOLE_BRIDGE + html;

  return (
    <div className={cn('flex min-h-0 flex-col bg-card', className)}>
      <div className="flex h-9 items-center gap-2 border-b px-3 text-xs font-medium text-muted-foreground">
        Preview
        <span className="ml-auto" />
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-7"
          aria-label="Reload preview"
          onClick={() => {
            setLines([]);
            setHtml(text.toString());
            setReloads((n) => n + 1);
          }}
        >
          <RotateCw />
        </Button>
      </div>
      <iframe
        key={reloads}
        ref={frame}
        title="Live preview"
        sandbox="allow-scripts allow-modals allow-forms"
        srcDoc={srcDoc}
        className="min-h-0 flex-1 border-0 bg-white"
      />
      <div className="h-24 shrink-0 overflow-auto border-t bg-muted/40 px-3 py-1.5 font-mono text-[11px] leading-5">
        {lines.length === 0 ? (
          <span className="text-muted-foreground">Console output appears here.</span>
        ) : (
          lines.map((l) => (
            <div
              key={l.id}
              className={cn(
                'whitespace-pre-wrap',
                l.level === 'error' && 'text-destructive',
                l.level === 'warn' && 'text-warning',
              )}
            >
              {l.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
