import { Code2, History, NotebookPen, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { AppShell } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useSession } from '@/lib/auth-client';

const FEATURES = [
  {
    icon: NotebookPen,
    title: 'Shared notes',
    body: 'Talk through the problem in a live document both of you can edit.',
  },
  {
    icon: Code2,
    title: 'Write and run code',
    body: 'A real editor with live cursors. Python, JavaScript and TypeScript run right in the room.',
  },
  {
    icon: History,
    title: 'Replay every session',
    body: 'Scrub back through the interview, with markers for every code run.',
  },
  {
    icon: ShieldCheck,
    title: 'Transparent by design',
    body: 'Candidates see exactly what is recorded. Nothing happens behind their back.',
  },
];

export function LandingPage() {
  const { data: session } = useSession();
  return (
    <AppShell>
      <section className="mx-auto max-w-4xl px-4 pt-16 pb-12 text-center sm:pt-24">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Technical interviews, side by side.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          One link opens a shared room with notes and a code editor that runs code. No screen
          sharing, no installs, and it works on a slow connection.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild>
            <Link to={session ? '/dashboard' : '/login'}>Start an interview</Link>
          </Button>
          <Button size="lg" variant="outline" disabled title="Coming soon">
            Practise with a peer
          </Button>
        </div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-20 sm:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="p-5">
            <Icon className="size-5 text-primary" aria-hidden />
            <h2 className="mt-3 font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </Card>
        ))}
      </section>
    </AppShell>
  );
}
