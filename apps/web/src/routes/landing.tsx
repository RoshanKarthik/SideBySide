import {
  ArrowRight,
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
import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router';
import { MarketingShell } from '@/components/layout';
import { ProductPreview } from '@/components/marketing/product-preview';
import { HeroGlow, Reveal } from '@/components/marketing/reveal';
import { Button } from '@/components/ui/button';
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
    body: 'Everyone sees the same integrity signals. Signals, never verdicts.',
    span: 'md:col-span-2',
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

export default function LandingPage() {
  const { data: session } = useSession();
  const reduced = useReducedMotion();
  const start = session ? '/dashboard?new=1' : '/login?mode=signup';

  return (
    <MarketingShell>
      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <HeroGlow />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-20 sm:pt-24 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur"
            >
              <span className="size-1.5 rounded-full bg-success" />
              No screen sharing. No installs. Works on 3G.
            </motion.div>
            <motion.h1
              initial={reduced ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
              className="mt-6 text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl"
            >
              Technical interviews,
              <br />
              <span className="text-gradient">side by side.</span>
            </motion.h1>
            <motion.p
              initial={reduced ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.12 }}
              className="mt-6 max-w-xl text-lg text-muted-foreground"
            >
              One link opens a live room with shared notes, a code editor that actually runs code,
              hidden tests and a whiteboard. Every keystroke is replayable afterwards.
            </motion.p>
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-8 flex flex-wrap gap-3"
            >
              <Button size="lg" variant="glow" asChild>
                <Link to={start}>
                  Start an interview <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to={session ? '/practice' : '/login?next=/practice'}>
                  Practise with a peer
                </Link>
              </Button>
            </motion.div>
          </div>
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 24, rotateX: 8 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.2, 0.7, 0.2, 1] }}
            style={{ perspective: 1200 }}
            className="relative"
          >
            <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(closest-side,var(--glow),transparent)] blur-xl" />
            <ProductPreview />
          </motion.div>
        </div>
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
          {STATS.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center justify-center gap-2 bg-background px-4 py-4 text-sm text-muted-foreground"
            >
              <Icon className="size-4 text-primary" /> {label}
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary">Everything in one room</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            What a good interview actually needs
          </h2>
          <p className="mt-4 text-muted-foreground">
            Built for the hour you spend with a candidate — and the decision afterwards.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body, span }, i) => (
            <Reveal key={title} delay={i * 0.05} className={cn(span)}>
              <div className="card-glow group relative h-full overflow-hidden rounded-2xl border bg-card p-6">
                <div className="absolute -top-16 -right-16 size-40 rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="flex size-10 items-center justify-center rounded-lg border bg-background">
                  <Icon className="size-5 text-primary" />
                </div>
                <h3 className="mt-5 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="relative scroll-mt-20 border-y bg-card/30 py-24">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal className="max-w-2xl">
            <p className="text-sm font-medium text-primary">How it works</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              From link to decision in three steps
            </h2>
          </Reveal>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <Reveal key={title} delay={i * 0.08}>
                <li className="relative h-full rounded-2xl border bg-background p-6">
                  <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                  <Icon className="mt-4 size-6 text-primary" />
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Call to action */}
      <section className="mx-auto max-w-6xl px-4 py-24">
        <Reveal>
          <div className="relative isolate overflow-hidden rounded-3xl border bg-card px-6 py-16 text-center sm:px-16">
            <div className="bg-dots mask-radial absolute inset-0 -z-10 opacity-60" />
            <div className="absolute -bottom-32 left-1/2 -z-10 h-64 w-[640px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)] blur-2xl" />
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Run your next interview <span className="text-gradient">side by side</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Free to use. Candidates join without an account.
            </p>
            <Button size="lg" variant="glow" className="mt-8" asChild>
              <Link to={start}>
                Create your first room <ArrowRight />
              </Link>
            </Button>
          </div>
        </Reveal>
      </section>
    </MarketingShell>
  );
}
