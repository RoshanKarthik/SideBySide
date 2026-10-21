import { CheckCircle2 } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from '@/lib/navigation';
import { Logo, ThemeToggle } from '@/components/layout';
import { BackgroundVideo } from './cinematic-hero';
import { RoomPreview } from './previews';

const POINTS = [
  'Video call, code editor, tests and whiteboard in one room',
  'Candidates join from a link — no account, no install',
  'Replay every session with your private notes and rubric',
];

/**
 * Split screen used by sign-in and join: the form on the left, the product (or details about
 * the room being joined) on the right.
 */
export function AuthLayout({
  children,
  aside,
  header,
  style,
}: {
  children: ReactNode;
  aside?: ReactNode;
  /** Replaces the SideBySide logo, e.g. with the company's brand on a join page. */
  header?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="grid min-h-full bg-background lg:grid-cols-2" style={style}>
      <div className="relative flex flex-col px-6 py-5 sm:px-10">
        <div className="flex items-center justify-between">
          {header ?? <Logo />}
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm animate-fade-up">{children}</div>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to the{' '}
          <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">
            Terms
          </Link>{' '}
          and{' '}
          <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
            Privacy notice
          </Link>
          .
        </p>
      </div>
      {/* The landing hero's video, so moving between the two feels like one place. */}
      <div className="cinematic relative isolate hidden overflow-hidden lg:flex lg:flex-col lg:justify-center lg:px-14">
        <BackgroundVideo />
        <div aria-hidden className="absolute inset-0 z-0 bg-[hsl(201_100%_13%/0.35)]" />
        <div className="relative z-10">
          {aside ?? (
            <div className="mx-auto w-full max-w-lg">
              <RoomPreview className="border-white/15 bg-black/35 backdrop-blur-md" />
              <ul className="liquid-glass mt-8 space-y-3 rounded-2xl p-5">
                {POINTS.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-sm text-foreground/90">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

export function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
    </svg>
  );
}
