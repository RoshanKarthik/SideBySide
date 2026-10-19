import { AppShell } from '@/components/layout';

function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <AppShell>
      <article className="mx-auto max-w-2xl space-y-4 px-4 py-12 text-sm leading-relaxed">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground">
          Placeholder text. Have this page reviewed before a public launch.
        </p>
        {children}
      </article>
    </AppShell>
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
