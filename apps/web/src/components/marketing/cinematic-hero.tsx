import '@fontsource/instrument-serif/400.css';
import './cinematic.css';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4';

/**
 * The background video is decoration (~14 MB), so it is skipped for people who asked for less
 * motion or less data; the navy background stands in for it.
 */
function wantsVideo(): boolean {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return false;
  return !document.documentElement.classList.contains('low-bandwidth');
}

/** Full-bleed looping video that fades in once it can play, and quietly disappears on error. */
export function BackgroundVideo({ className }: { className?: string }) {
  const [enabled] = useState(wantsVideo);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // A cached video can be ready before React's media listeners exist, so check on mount too.
  const ref = useCallback((video: HTMLVideoElement | null) => {
    if (!video) return;
    const show = () => setReady(true);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) show();
    video.addEventListener('loadeddata', show);
    video.addEventListener('playing', show);
    return () => {
      video.removeEventListener('loadeddata', show);
      video.removeEventListener('playing', show);
    };
  }, []);
  if (!enabled || failed) return null;
  return (
    <video
      ref={ref}
      aria-hidden
      autoPlay
      loop
      muted
      playsInline
      src={VIDEO_SRC}
      onError={() => setFailed(true)}
      className={cn(
        'absolute inset-0 z-0 h-full w-full object-cover transition-opacity duration-1000',
        ready ? 'opacity-100' : 'opacity-0',
        className,
      )}
    />
  );
}

const NAV = [
  { label: 'Home', href: '/', active: true },
  { label: 'Features', href: '/#features' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Practice', href: '/practice' },
  { label: 'Privacy', href: '/privacy' },
];

export function CinematicHero() {
  const { data: session } = useSession();
  const start = session ? '/dashboard?new=1' : '/login?mode=signup';

  // Fetch the sign-in page's code while the visitor reads, so the click feels instant.
  useEffect(() => {
    const id = setTimeout(() => void import('@/routes/login'), 1500);
    return () => clearTimeout(id);
  }, []);

  return (
    <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
      <BackgroundVideo />
      <div
        aria-hidden
        className="hero-fade pointer-events-none absolute inset-x-0 bottom-0 z-0 h-48"
      />

      <nav
        aria-label="Main"
        className="relative z-10 mx-auto flex w-full max-w-7xl flex-row items-center justify-between px-8 py-6"
      >
        <Link
          to="/"
          className="font-display text-3xl tracking-tight text-foreground"
          aria-label="SideBySide home"
        >
          SideBySide
        </Link>
        <ul className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <li key={item.label}>
              <a
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                className={cn(
                  'text-sm transition-colors hover:text-foreground',
                  item.active ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-5">
          {!session && (
            <Link
              to="/login"
              viewTransition
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              Sign in
            </Link>
          )}
          <Link
            to={session ? '/dashboard' : start}
            viewTransition
            className="liquid-glass rounded-full px-6 py-2.5 text-sm text-foreground transition-transform duration-300 hover:scale-[1.03]"
          >
            {session ? 'Open app' : 'Get started'}
          </Link>
        </div>
      </nav>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-[90px] text-center">
        <h1 className="animate-fade-rise font-display max-w-7xl text-5xl leading-[0.95] tracking-[-2.46px] sm:text-7xl md:text-8xl">
          Where <em className="text-muted-foreground not-italic">talent</em> shows up{' '}
          <em className="text-muted-foreground not-italic">side by side.</em>
        </h1>
        <p className="animate-fade-rise-delay mt-8 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          One link opens a live room with shared notes, a code editor that actually runs code,
          hidden tests and a whiteboard. No screen sharing, no installs, and every keystroke can be
          replayed afterwards.
        </p>
        <Link
          to={start}
          viewTransition
          className="animate-fade-rise-delay-2 liquid-glass mt-12 cursor-pointer rounded-full px-14 py-5 text-base text-foreground transition-transform duration-300 hover:scale-[1.03]"
        >
          Start an interview
        </Link>
        <Link
          to={session ? '/practice' : '/login?next=/practice'}
          viewTransition
          className="animate-fade-rise-delay-2 mt-6 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          or practise with a peer →
        </Link>
      </div>
    </section>
  );
}
