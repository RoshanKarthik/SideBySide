import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-xl border bg-card text-card-foreground shadow-xs', className)}
      {...props}
    />
  );
}

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: ComponentProps<'span'> & { tone?: 'neutral' | 'live' | 'success' | 'danger' | 'info' }) {
  const tones = {
    neutral: 'bg-muted text-muted-foreground',
    live: 'bg-destructive/12 text-destructive',
    success: 'bg-success/15 text-success',
    danger: 'bg-destructive/12 text-destructive',
    info: 'bg-accent text-accent-foreground',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent',
        className,
      )}
    />
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}
