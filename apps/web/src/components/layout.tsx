import {
  BookOpen,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Moon,
  Search,
  Settings,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { CommandPalette, useCommandPalette } from '@/components/command-palette';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/card';
import {
  Avatar,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/overlay';
import { signOut, useSession } from '@/lib/auth-client';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

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

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/questions', label: 'Question bank', icon: BookOpen },
  { to: '/practice', label: 'Practice', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/**
 * Signed-in pages: a sidebar with navigation, search (Ctrl+K) and the account menu.
 * Visitors who aren't signed in get the marketing layout instead.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  if (!session) return <MarketingShell>{children}</MarketingShell>;
  return <SignedInShell user={session.user}>{children}</SignedInShell>;
}

function SignedInShell({
  user,
  children,
}: {
  user: { id: string; name: string; email: string; image?: string | null };
  children: ReactNode;
}) {
  const palette = useCommandPalette();
  // The mobile menu is open for the page it was opened on; navigating closes it.
  const location = useLocation();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const mobileOpen = openOn === location.pathname;
  const setMobileOpen = (open: boolean) => setOpenOn(open ? location.pathname : null);

  const sidebar = (
    <div className="flex h-full flex-col gap-1 p-3">
      <div className="flex h-10 items-center justify-between px-2">
        <Logo to="/dashboard" />
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        >
          <X />
        </Button>
      </div>
      <button
        type="button"
        onClick={() => palette.setOpen(true)}
        className="mt-3 mb-2 flex h-9 items-center gap-2 rounded-md border bg-background/50 px-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search…</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                isActive && 'bg-muted text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-primary" />
                )}
                <Icon className={cn('size-4', isActive && 'text-primary')} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto">
        <UserMenu user={user} />
      </div>
    </div>
  );

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r bg-card/40 lg:block">
        {sidebar}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 animate-fade-in border-r bg-background">
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <MenuIcon />
          </Button>
          <Logo to="/dashboard" />
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Search"
            onClick={() => palette.setOpen(true)}
          >
            <Search />
          </Button>
        </header>
        <main className="flex-1">{children}</main>
      </div>
      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} />
    </div>
  );
}

function UserMenu({
  user,
}: {
  user: { id: string; name: string; email: string; image?: string | null };
}) {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-md p-2 text-left transition-colors hover:bg-muted"
        >
          <Avatar name={user.name} id={user.id} src={user.image} size={30} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
        </button>
      </MenuTrigger>
      <MenuContent side="top" align="start" className="w-56">
        <MenuLabel>Signed in as {user.email}</MenuLabel>
        <MenuSeparator />
        <MenuItem onSelect={() => navigate('/settings')}>
          <Settings /> Settings
        </MenuItem>
        <MenuItem onSelect={toggle}>
          {theme === 'dark' ? <Sun /> : <Moon />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          onSelect={async () => {
            await signOut();
            navigate('/');
          }}
        >
          <LogOut /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** Public pages: a translucent top bar and a footer. */
export function MarketingShell({
  children,
  bare = false,
}: {
  children: ReactNode;
  bare?: boolean;
}) {
  const { data: session } = useSession();
  return (
    <div className="flex min-h-full flex-col">
      <header className="glass sticky top-0 z-30 border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Logo />
          <nav className="flex items-center gap-1">
            {!bare && (
              <>
                <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                  <a href="/#features">Features</a>
                </Button>
                <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                  <a href="/#how-it-works">How it works</a>
                </Button>
              </>
            )}
            <ThemeToggle />
            {session ? (
              <Button size="sm" asChild>
                <Link to="/dashboard">Open app</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/login">Sign in</Link>
                </Button>
                {!bare && (
                  <Button size="sm" asChild className="hidden sm:inline-flex">
                    <Link to="/login?mode=signup">Get started</Link>
                  </Button>
                )}
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <LogoMark className="size-5" /> SideBySide — interviews without screen sharing.
        </span>
        <span className="flex gap-5">
          <Link to="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-foreground">
            Terms
          </Link>
        </span>
      </div>
    </footer>
  );
}
