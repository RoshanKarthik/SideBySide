import {
  AppWindow,
  ArrowRight,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  EyeOff,
  History,
  Lock,
  PenTool,
  ShieldCheck,
  Timer,
  Trash2,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from '@/lib/navigation';
import { MarketingShell } from '@/components/layout';
import { CinematicHero } from '@/components/marketing/cinematic-hero';
import {
  BoardMini,
  BrandMini,
  CallMini,
  EditorMini,
  PanelMini,
  PreviewMini,
  ReplayMini,
  RoomPreview,
  SignalsMini,
  TestsMini,
} from '@/components/marketing/previews';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

/** Everything a structured technical interview needs, each shown with a small product picture. */
const PARTS: {
  icon: LucideIcon;
  title: string;
  body: string;
  preview: ReactNode;
}[] = [
  {
    icon: Video,
    title: 'Face-to-face video call',
    body: 'Camera and microphone right inside the room, with a device check before you join. No separate meeting link.',
    preview: <CallMini />,
  },
  {
    icon: Code2,
    title: 'A shared editor that runs code',
    body: 'Monaco with live cursors for everyone. Python, JavaScript and TypeScript run in a sandbox in the browser.',
    preview: <EditorMini />,
  },
  {
    icon: ClipboardCheck,
    title: 'Hidden tests and a score',
    body: 'Weighted test cases give one clear score. Hidden inputs never reach the candidate.',
    preview: <TestsMini />,
  },
  {
    icon: PenTool,
    title: 'System design whiteboard',
    body: 'Sketch architectures together with live pointers and ready-made templates.',
    preview: <BoardMini />,
  },
  {
    icon: Lock,
    title: 'Private interviewer panel',
    body: 'Question bank, hints, timestamped notes and a rubric only interviewers can see.',
    preview: <PanelMini />,
  },
  {
    icon: EyeOff,
    title: 'Transparent activity signals',
    body: 'Pastes and tab switches are shown to everyone in the room. Signals, never verdicts.',
    preview: <SignalsMini />,
  },
  {
    icon: History,
    title: 'Full session replay',
    body: 'Replay notes, code and whiteboard with markers for questions, hints and test runs.',
    preview: <ReplayMini />,
  },
  {
    icon: AppWindow,
    title: 'Live front-end preview',
    body: 'HTML, CSS and JavaScript render in a sandboxed preview as the candidate types.',
    preview: <PreviewMini />,
  },
  {
    icon: Building2,
    title: 'Your company on the room',
    body: 'Your name, logo and colour on the join page and in the room candidates see.',
    preview: <BrandMini />,
  },
];

const FLOW: { icon: LucideIcon; label: string; title: string; items: string[] }[] = [
  {
    icon: CalendarCheck,
    label: 'Before',
    title: 'Prepare in two minutes',
    items: [
      'Create a room and pick the language',
      'Choose questions from your bank or the public one',
      'Send the candidate one link — no account needed',
    ],
  },
  {
    icon: Timer,
    label: 'During',
    title: 'Run a structured interview',
    items: [
      'The candidate checks camera and microphone in the lobby',
      'Show the question, reveal hints, lock the editor when needed',
      'Run hidden tests and take timestamped notes',
    ],
  },
  {
    icon: CheckCircle2,
    label: 'After',
    title: 'Decide with evidence',
    items: [
      'Score the rubric while it’s fresh',
      'Review the replay and its key moments',
      'Compare candidates by score on your dashboard',
    ],
  },
];

const TRUST: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: EyeOff,
    title: 'Hidden tests stay hidden',
    body: 'Inputs and expected output are filtered on the server for candidates.',
  },
  {
    icon: Video,
    title: 'Calls are not recorded',
    body: 'Audio and video go directly between participants and are never stored.',
  },
  {
    icon: ShieldCheck,
    title: 'Clear consent',
    body: 'Everyone is told what is recorded before they join a room.',
  },
  {
    icon: Trash2,
    title: 'Automatic deletion',
    body: 'Sessions are deleted after 7, 30 or 90 days — or whenever you choose.',
  },
];

function SectionHeading({
  eyebrow,
  title,
  children,
  center,
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  center?: boolean;
}) {
  return (
    <div className={cn('max-w-2xl', center && 'mx-auto text-center')}>
      <p className="text-xs font-semibold tracking-wider text-primary uppercase">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {children && (
        <p className="mt-4 text-base leading-relaxed text-pretty text-muted-foreground">
          {children}
        </p>
      )}
    </div>
  );
}

export default function LandingPage() {
  const { data: session } = useSession();
  const start = session ? '/dashboard?new=1' : '/login?mode=signup';
  const practice = session ? '/practice' : '/login?next=/practice';

  return (
    <MarketingShell revealHeaderAfter="top">
      <CinematicHero id="top" />

      {/* The product, up close */}
      <section className="border-b">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-8 pb-20 sm:px-6 lg:grid-cols-[1fr_1.15fr]">
          <div>
            <SectionHeading
              eyebrow="See it in action"
              title="The whole technical interview, in one room"
            >
              Video call, a shared editor that runs code, hidden tests with a score, a whiteboard
              and a private scorecard — with a full replay when you’re done.
            </SectionHeading>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {['No install for candidates', 'Runs in the browser', 'Free to use'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-success" /> {t}
                </li>
              ))}
            </ul>
            <Button size="lg" variant="glow" className="mt-8" asChild>
              <Link to={start}>
                Start an interview <ArrowRight />
              </Link>
            </Button>
          </div>
          <RoomPreview className="w-full" />
        </div>
      </section>

      {/* What a good interview needs */}
      <section id="features" className="scroll-mt-16 border-b bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHeading eyebrow="Everything in one room" title="What a good interview needs">
            Each part of a fair, structured interview is built in, so you never juggle a meeting
            app, a code pad and a spreadsheet.
          </SectionHeading>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PARTS.map(({ icon: Icon, title, body, preview }) => (
              <article
                key={title}
                className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-card"
              >
                <div className="border-b bg-muted/40 p-4">{preview}</div>
                <div className="p-5">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <Icon className="size-4 text-primary" /> {title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* How an interview runs */}
      <section id="how-it-works" className="scroll-mt-16 border-b">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHeading eyebrow="How it works" title="From invite to decision">
            A clear routine for every interviewer on your team.
          </SectionHeading>
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {FLOW.map(({ icon: Icon, label, title, items }, i) => (
              <li key={label} className="h-full rounded-xl border bg-card p-6 shadow-card">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    {i + 1}. {label}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                      {item}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Practice */}
      <section id="practice" className="scroll-mt-16 border-b bg-muted/30">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <SectionHeading eyebrow="Practice mode" title="Prepare with a peer, then swap roles">
            Get matched with someone at your level. You interview them for one round, they interview
            you for the next, and you rate each other at the end.
          </SectionHeading>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { k: 'Matched', v: 'by topic and level' },
              { k: '2 rounds', v: 'roles swap halfway' },
              { k: 'Feedback', v: 'private ratings' },
            ].map(({ k, v }) => (
              <div key={k} className="rounded-xl border bg-card p-5 shadow-card">
                <p className="text-lg font-semibold">{k}</p>
                <p className="mt-1 text-sm text-muted-foreground">{v}</p>
              </div>
            ))}
            <Button variant="outline" className="sm:col-span-3" asChild>
              <Link to={practice}>
                Find a practice partner <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section id="trust" className="scroll-mt-16 border-b">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHeading
            eyebrow="Privacy and fairness"
            title="Built for candidates’ trust"
            center
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border bg-card p-5 shadow-card">
                <Icon className="size-5 text-primary" />
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Call to action */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="relative isolate overflow-hidden rounded-2xl bg-primary px-6 py-14 text-center text-primary-foreground shadow-raised sm:px-12">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_80%_at_50%_0%,rgb(255_255_255/0.18),transparent)]" />
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Run your next technical interview here
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-primary-foreground/80">
            Create a room in a minute. Candidates join from the link with a name.
          </p>
          <Button size="lg" variant="secondary" className="mt-8" asChild>
            <Link to={start}>
              Create a room <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </MarketingShell>
  );
}
