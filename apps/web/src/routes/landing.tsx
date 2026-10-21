import {
  Code2,
  EyeOff,
  History,
  Link2,
  Lock,
  NotebookPen,
  PenTool,
  ShieldCheck,
  Signal,
  Sparkles,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { LogoMark } from '@/components/layout';
import { CinematicHero } from '@/components/marketing/cinematic-hero';
import { ProductPreview } from '@/components/marketing/product-preview';
import { Reveal } from '@/components/marketing/reveal';
import { useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

const FEATURES = [
  {
    icon: Code2,
    title: 'A real editor that runs code',
    body: 'Monaco with live cursors for both of you. Python, JavaScript and TypeScript run in a sandbox right in the browser.',
    span: 'md:col-span-2',
  },
  {
    icon: EyeOff,
    title: 'Hidden test cases',
    body: 'Run tests reports pass or fail. Hidden inputs never leave the server for the candidate.',
  },
  {
    icon: PenTool,
    title: 'Shared whiteboard',
    body: 'Sketch the system design with live pointers and ready-made templates.',
  },
  {
    icon: Lock,
    title: 'Private interviewer panel',
    body: 'Question bank, hints, timestamped notes, a rubric and a timer only interviewers can see.',
  },
  {
    icon: History,
    title: 'Replay every session',
    body: 'Scrub back through notes, code and whiteboard with markers for runs and tests.',
  },
  {
    icon: ShieldCheck,
    title: 'Transparent by design',
    body: 'Everyone sees the same activity signals. Signals, never verdicts.',
    span: 'md:col-span-3',
  },
];

const STEPS = [
  {
    icon: Link2,
    title: 'Create a room, send the link',
    body: 'Pick a language and questions. The candidate joins with just their name — no account, no install.',
  },
  {
    icon: NotebookPen,
    title: 'Discuss, code and sketch together',
    body: 'Show the problem, reveal hints, run code and tests. Your notes and rubric stay private.',
  },
  {
    icon: History,
    title: 'Replay and decide',
    body: 'End the session and review the full replay with your rubric before the debrief.',
  },
];

const STATS = [
  { icon: Signal, label: 'Built for slow connections' },
  { icon: Code2, label: 'Runs code in the browser' },
  { icon: Users, label: 'Peer practice mode' },
  { icon: Sparkles, label: 'Free, no card needed' },
];

/** Section heading in the hero's voice: a small label, then a serif title. */
function Heading({
  eyebrow,
  children,
  center,
}: {
  eyebrow: string;
  children: ReactNode;
  center?: boolean;
}) {
  return (
    <div className={cn('max-w-2xl', center && 'mx-auto text-center')}>
      <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">{eyebrow}</p>
      <h2 className="font-display mt-4 text-4xl leading-[1.05] tracking-[-1px] sm:text-6xl">
        {children}
      </h2>
    </div>
  );
}

function GlassLink({ to, children, large }: { to: string; children: ReactNode; large?: boolean }) {
  return (
    <Link
      to={to}
      viewTransition
      className={cn(
        'liquid-glass inline-flex rounded-full text-foreground transition-transform duration-300 hover:scale-[1.03]',
        large ? 'px-12 py-4 text-base' : 'px-7 py-3 text-sm',
      )}
    >
      {children}
    </Link>
  );
}

export default function LandingPage() {
  const { data: session } = useSession();
  const start = session ? '/dashboard?new=1' : '/login?mode=signup';
  const practice = session ? '/practice' : '/login?next=/practice';

  return (
    <div className="cinematic cinematic-page flex min-h-full flex-col">
      <CinematicHero />

      {/* The product, up close */}
      <section className="relative">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-16 pb-24 lg:grid-cols-[1fr_1.15fr]">
          <Reveal>
            <Heading eyebrow="See it in action">
              Interviews, <em className="text-muted-foreground not-italic">side by side.</em>
            </Heading>
            <p className="mt-6 max-w-lg leading-relaxed text-muted-foreground">
              Both of you type in the same editor with live cursors. Run the code, run the hidden
              tests, sketch the design, and replay all of it afterwards.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-6">
              <GlassLink to={start}>Start an interview</GlassLink>
              <Link
                to={practice}
                viewTransition
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Practise with a peer →
              </Link>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <ProductPreview className="liquid-glass border-0 bg-white/[0.03] shadow-2xl shadow-black/40" />
          </Reveal>
        </div>
        <Reveal className="mx-auto max-w-6xl px-6">
          <ul className="liquid-glass grid grid-cols-2 rounded-2xl sm:grid-cols-4">
            {STATS.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center justify-center gap-2 px-4 py-5 text-sm text-muted-foreground"
              >
                <Icon className="size-4 text-foreground/80" /> {label}
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto w-full max-w-6xl scroll-mt-8 px-6 py-28">
        <Reveal>
          <Heading eyebrow="Everything in one room" center>
            What a good interview <em className="text-muted-foreground not-italic">needs.</em>
          </Heading>
        </Reveal>
        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body, span }, i) => (
            <Reveal key={title} delay={i * 0.06} className={cn(span)}>
              <div className="liquid-glass glass-card h-full rounded-2xl p-7">
                <Icon className="size-5 text-foreground/80" />
                <h3 className="font-display mt-6 text-2xl tracking-[-0.3px]">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto w-full max-w-6xl scroll-mt-8 px-6 py-24">
        <Reveal>
          <Heading eyebrow="How it works">
            From link to decision,{' '}
            <em className="text-muted-foreground not-italic">in three steps.</em>
          </Heading>
        </Reveal>
        <ol className="mt-16 grid gap-10 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <li className="border-t border-white/15 pt-6">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span className="font-display text-3xl text-foreground">0{i + 1}</span>
                  <Icon className="size-4" />
                </div>
                <h3 className="font-display mt-4 text-2xl tracking-[-0.3px]">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* Closing call to action */}
      <section className="mx-auto w-full max-w-6xl px-6 pt-12 pb-32 text-center">
        <Reveal>
          <h2 className="font-display mx-auto max-w-4xl text-5xl leading-[0.95] tracking-[-2px] sm:text-7xl">
            Run your next interview{' '}
            <em className="text-muted-foreground not-italic">side by side.</em>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-muted-foreground">
            Free to use. Candidates join without an account.
          </p>
          <div className="mt-12">
            <GlassLink to={start} large>
              Create your first room
            </GlassLink>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <LogoMark className="size-5" />
            <span className="font-display text-base text-foreground">SideBySide</span> — interviews
            without screen sharing.
          </span>
          <span className="flex gap-6">
            <Link to="/privacy" viewTransition className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" viewTransition className="hover:text-foreground">
              Terms
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
