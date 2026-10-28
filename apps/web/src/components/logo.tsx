import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/lib/theme';
import { Link } from '@/lib/navigation';
import { cn } from '@/lib/utils';

/*
 * The logo and theme switch, kept apart from the app layout so pages that only need these (the
 * room, join and replay pages) don't load the sidebar and command palette.
 */

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative inline-flex size-7 items-center justify-center rounded-lg bg-brand-gradient shadow-[0_4px_16px_-4px_var(--glow)]',
        className,
      )}
      aria-hidden
    >
      <span className="flex gap-[3px]">
        <span className="h-3.5 w-[5px] rounded-[2px] bg-white" />
        <span className="h-3.5 w-[5px] rounded-[2px] bg-white/60" />
      </span>
    </span>
  );
}

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 font-semibold tracking-tight">
      <LogoMark />
      <span>SideBySide</span>
    </Link>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      className={className}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  );
}
