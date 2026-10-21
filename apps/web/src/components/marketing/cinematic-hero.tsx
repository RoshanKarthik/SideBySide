import '@fontsource/instrument-serif/400.css';
import './cinematic.css';
import { useCallback, useState } from 'react';
import { ThemeToggle } from '@/components/layout';
import { useSession } from '@/lib/auth-client';
import { Link } from '@/lib/navigation';
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
  { label: 'Practice', href: '/#practice' },
  { label: 'Privacy', href: '/#trust' },
];

/** The landing page's opening: video, glass navigation and the headline. */
export function CinematicHero({ id }: { id?: string }) {
  const { data: session } = useSession();
  const start = session ? '/dashboard?new=1' : '/login?mode=signup';

  return (
    <section
      id={id}
      className="cinematic relative isolate flex min-h-[100svh] flex-col overflow-hidden"
    >
      <BackgroundVideo />
      <div
        aria-hidden
        className="hero-fade pointer-events-none absolute inset-x-0 bottom-0 z-0 h-56"
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
        <div className="flex items-center gap-3 sm:gap-5">
          <ThemeToggle className="text-muted-foreground hover:bg-white/10 hover:text-foreground" />
          {!session && (
            <Link
              to="/login"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              Sign in
            </Link>
          )}
          <Link
            to={session ? '/dashboard' : start}
            className="liquid-glass rounded-full px-6 py-2.5 text-sm text-foreground hover:scale-[1.03]"
          >
            {session ? 'Open dashboard' : 'Get started'}
          </Link>
        </div>
      </nav>

      {/* Bottom padding keeps the buttons above the fade into the page below. */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pt-4 pb-48 text-center">
        <h1 className="animate-fade-rise font-display max-w-7xl text-5xl leading-[0.95] font-normal tracking-[-2.46px] sm:text-7xl md:text-8xl">
          Where <em className="text-muted-foreground not-italic">talent</em> shows up{' '}
          <em className="text-muted-foreground not-italic">side by side.</em>
        </h1>
        <p className="animate-fade-rise-delay mt-8 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          One link opens a live interview room: a video call, a code editor that actually runs code,
          hidden tests and a whiteboard. No installs, and every keystroke can be replayed
          afterwards.
        </p>
        <Link
          to={start}
          className="animate-fade-rise-delay-2 liquid-glass mt-12 cursor-pointer rounded-full px-14 py-5 text-base text-foreground hover:scale-[1.03]"
        >
          Start an interview
        </Link>
        <Link
          to={session ? '/practice' : '/login?next=/practice'}
          className="animate-fade-rise-delay-2 mt-6 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          or practise with a peer →
        </Link>
      </div>
    </section>
  );
}
