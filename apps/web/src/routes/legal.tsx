import '@fontsource/instrument-serif/400.css';
import '@/components/marketing/cinematic.css';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

/** Privacy and Terms, in the same cinematic style as the landing page they're linked from. */
function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="cinematic min-h-full">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-8 py-6">
        <Link
          to="/"
          viewTransition
          className="font-display text-3xl tracking-tight text-foreground"
          aria-label="SideBySide home"
        >
          SideBySide
        </Link>
        <Link
          to="/"
          viewTransition
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back home
        </Link>
      </nav>
      <article className="animate-fade-rise mx-auto max-w-2xl space-y-5 px-6 pt-12 pb-24 leading-relaxed text-foreground/85">
        <h1 className="font-display text-6xl leading-none tracking-[-1.5px] text-foreground">
          {title}
        </h1>
        <p className="liquid-glass rounded-xl px-4 py-3 text-sm text-muted-foreground">
          Placeholder text. Have this page reviewed before a public launch.
        </p>
        {children}
      </article>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <p>
        SideBySide records what happens inside an interview room so it can be replayed: edits to
        shared notes and code, code runs and their output, and when people join and leave. Everyone
        is told this before they join, and nothing is recorded without that notice.
      </p>
      <p>
        We do not record audio, video or your screen, and we do not keep IP addresses. Sessions are
        deleted automatically after the retention period the interviewer picked (7, 30 or 90 days),
        and the interviewer can delete a session at any time.
      </p>
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage title="Terms">
      <p>
        Use SideBySide for interviews and practice sessions you have permission to run. Don&apos;t
        use it to run code that attacks other systems or to record people without telling them.
      </p>
    </LegalPage>
  );
}
