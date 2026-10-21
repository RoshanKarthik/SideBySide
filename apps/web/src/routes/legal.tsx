import { MarketingShell } from '@/components/layout';

/** Privacy and Terms. */
function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <MarketingShell bare>
      <article className="mx-auto max-w-2xl space-y-5 px-6 pt-14 pb-24 leading-relaxed text-foreground/85">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          Placeholder text. Have this page reviewed before a public launch.
        </p>
        {children}
      </article>
    </MarketingShell>
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
        Video calls in a room are peer to peer: audio and video go directly between participants and
        are never recorded or stored by SideBySide. We do not record your screen, and we do not keep
        IP addresses. Sessions are deleted automatically after the retention period the interviewer
        picked (7, 30 or 90 days), and the interviewer can delete a session at any time.
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
