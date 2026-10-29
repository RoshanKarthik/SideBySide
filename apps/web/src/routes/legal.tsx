import { MarketingShell } from '@/components/layout';
import { Link } from '@/lib/navigation';

/** Privacy and Terms. Both describe how the app works today; update them with the code. */

const LAST_UPDATED = '29 October 2026';
/** Where people send privacy requests and questions. Empty until the owner chooses one. */
const CONTACT_EMAIL = '';

function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <MarketingShell bare>
      <article className="mx-auto max-w-2xl space-y-5 px-6 pt-14 pb-24 leading-relaxed text-foreground/85">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          Draft, last updated {LAST_UPDATED}. This describes how SideBySide works today and hasn’t
          been reviewed by a lawyer yet.
        </p>
        {children}
      </article>
    </MarketingShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 pt-4">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">{children}</ul>;
}

function InlineLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="text-foreground underline underline-offset-2">
      {children}
    </Link>
  );
}

function Contact() {
  return (
    <Section title="Contact">
      {CONTACT_EMAIL ? (
        <p>
          For questions, requests about your data or complaints, email{' '}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-foreground underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>
          . We aim to reply within 30 days.
        </p>
      ) : (
        <p>
          A contact address for questions and data requests will be listed here. Until then, you can
          export or delete your data from <InlineLink to="/settings">Settings</InlineLink>, and
          guests can ask the interviewer who invited them to delete a session.
        </p>
      )}
    </Section>
  );
}

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <p>
        SideBySide is a free tool for live technical interviews and practice sessions, run by an
        independent developer (“we”). This page explains what it records, who can see it, which
        services help run it and how long anything is kept. There are no ads, and nothing is sold.
      </p>

      <Section title="The short version">
        <List>
          <li>
            Rooms record notes, code, the whiteboard, code runs and activity signals so the session
            can be replayed. Everyone sees a notice before joining.
          </li>
          <li>Video calls are never recorded. IP addresses aren’t stored.</li>
          <li>
            Rooms are deleted for good 7, 30 or 90 days after the session ends (30 by default).
          </li>
          <li>You can export your data and delete your account from Settings.</li>
        </List>
      </Section>

      <Section title="What SideBySide stores">
        <Subsection title="If you have an account">
          <p>
            Interviewers and practice users sign in with Google, GitHub or a link sent to their
            email. We store your name, email address and profile photo (from Google or GitHub), how
            you sign in and the sign-in tokens that service issues, your settings (default language,
            low-bandwidth mode) and any company branding you add (name, logo and colour). Questions
            you write for your question bank are stored with their test cases.
          </p>
        </Subsection>
        <Subsection title="If you join as a guest">
          <p>
            Only the name you type. Your browser keeps a pass for that room for 12 hours. If you
            later save the session to an account, it is linked to that account.
          </p>
        </Subsection>
        <Subsection title="Inside a room">
          <p>
            So the session can be replayed, the room records the following, each with the time it
            happened:
          </p>
          <List>
            <li>
              edits to the shared notes, code and whiteboard, including images added to the
              whiteboard;
            </li>
            <li>code runs: the code, its input and output, test results and scores;</li>
            <li>which questions were shown and which hints were revealed;</li>
            <li>when people join and leave;</li>
            <li>
              activity signals: pastes (how many characters, and the first 200 characters of the
              pasted text), large insertions into the code, switching tabs and leaving the window.
              Everyone in the room sees these as they happen. They are signals, not verdicts.
            </li>
          </List>
          <p>
            Interviewers also keep private notes and rubric scores that candidates never see.
            Practice partners can rate each other and leave a comment.
          </p>
        </Subsection>
        <Subsection title="AI reports">
          <p>
            When a session ends, an AI service writes a draft report for the interviewer and a
            feedback report for the candidate. It receives the problem, the code, test results, the
            shared notes, hints used and activity signals; the interviewer’s report also uses their
            private notes and rubric, which the candidate’s report never does. Reports are drafts to
            help a person review the session. SideBySide doesn’t make decisions about anyone.
          </p>
        </Subsection>
        <Subsection title="Sign-in emails">
          <p>
            To limit how many sign-in links are sent, we keep a one-way hash of the email address
            and the time it was sent, for one day.
          </p>
        </Subsection>
        <Subsection title="What SideBySide doesn’t collect">
          <List>
            <li>
              Audio and video from calls. They go directly between participants’ browsers and are
              never recorded or stored.
            </li>
            <li>Your screen.</li>
            <li>IP addresses.</li>
            <li>Analytics, advertising or tracking cookies.</li>
          </List>
        </Subsection>
      </Section>

      <Section title="Who can see what">
        <List>
          <li>
            The interviewer who created a room, and co-interviewers they invite, see everything
            recorded in it, including the replay and reports.
          </li>
          <li>
            Candidates see the shared notes, code, whiteboard and activity signals in the room.
            Afterwards they see the replay and their feedback report only if the interviewer chose
            to share them.
          </li>
          <li>In practice sessions, both partners can open the session afterwards.</li>
          <li>
            Anyone with a room’s link can join it as a guest while it’s open, so share links only
            with people you mean to invite.
          </li>
        </List>
      </Section>

      <Section title="Services that help run SideBySide">
        <p>Each of these receives only what it needs for its part:</p>
        <List>
          <li>
            <strong>Cloudflare</strong> hosts the app and stores live room data, runs Workers AI for
            reports, and helps set up calls. It may relay call traffic when a direct connection
            isn’t possible; that traffic stays encrypted and isn’t recorded.
          </li>
          <li>
            <strong>Neon</strong> hosts the database, on Amazon Web Services in the United States
            (Ohio).
          </li>
          <li>
            <strong>Google</strong> and <strong>GitHub</strong>, if you sign in with them. Google
            also helps set up calls, and its Gmail service sends sign-in emails.
          </li>
          <li>
            <strong>Wandbox</strong> (wandbox.org), a free public service, compiles and runs Java,
            C, C++ and Go: the code and its input are sent there when you run them. Python,
            JavaScript and TypeScript run in your browser.
          </li>
          <li>
            <strong>Groq</strong> writes AI reports when Cloudflare’s AI can’t.
          </li>
          <li>
            <strong>Amazon CloudFront</strong> serves the background video on the home and sign-in
            pages, so your browser contacts it when you open them.
          </li>
        </List>
        <p>
          To set up a call, your browser shares its network address with Cloudflare’s and Google’s
          connection servers and with the other people in the call. The database is in the United
          States, and live room data is kept in Cloudflare data centres, usually near where the room
          was first opened, so your data may be stored and processed outside India.
        </p>
      </Section>

      <Section title="How long data is kept">
        <List>
          <li>
            <strong>Rooms:</strong> the interviewer picks 7, 30 or 90 days (30 by default). That
            long after the session ends, the room is deleted for good with everything recorded in
            it, including notes, code, whiteboard images, runs, signals, scores, ratings and
            reports. The interviewer can delete a session earlier at any time.
          </li>
          <li>
            <strong>Accounts:</strong> until you delete your account.
          </li>
          <li>
            <strong>Sign-in:</strong> a sign-in link works once, for 10 minutes. A sign-in ends
            after 7 days without use, or when you sign out. Sign-in email hashes are kept for one
            day.
          </li>
        </List>
      </Section>

      <Section title="Your choices and rights">
        <List>
          <li>
            Download a copy of your data from <InlineLink to="/settings">Settings</InlineLink> →
            Export my data.
          </li>
          <li>Change your name and settings in Settings.</li>
          <li>
            Delete your account in Settings. Rooms you own are deleted with their recordings, except
            practice sessions, which stay with your partner. In rooms other people own, your name
            stays in their record but is no longer linked to you.
          </li>
          <li>Remove a session from your list, or, as its interviewer, delete it for everyone.</li>
          <li>
            If you joined as a guest, ask the interviewer to delete the session, or contact us.
          </li>
        </List>
        <p>
          Under India’s Digital Personal Data Protection Act, 2023 and similar laws, you can ask to
          see, correct or erase your personal data, and raise a complaint about how it’s handled.
        </p>
      </Section>

      <Section title="Cookies and browser storage">
        <p>
          SideBySide uses cookies only to sign you in and keep you signed in. Your browser’s storage
          keeps your theme, a few display preferences, a guest’s room pass and a pending link to
          save a session to an account. These stay on your device. There are no advertising or
          tracking cookies.
        </p>
      </Section>

      <Section title="Children">
        <p>SideBySide is for people aged 18 and over.</p>
      </Section>

      <Section title="Security">
        <p>
          Every permission is checked on the server, connections to SideBySide are encrypted, code
          you run in the browser runs in a locked-down sandbox, and sign-in links work only once. No
          system is perfectly secure; if a breach affects your data, we’ll tell you as the law
          requires.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          When this page changes, the date at the top changes too. See also the{' '}
          <InlineLink to="/terms">Terms</InlineLink>.
        </p>
      </Section>

      <Contact />
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage title="Terms">
      <p>
        These terms apply when you use SideBySide, a free tool for live technical interviews and
        practice sessions run by an independent developer (“we”). By using it, you agree to them.
        The <InlineLink to="/privacy">Privacy</InlineLink> page explains how your data is handled.
      </p>

      <Section title="The service">
        <p>
          SideBySide is free and provided as it is. It runs on free plans of other services with
          daily limits (code runs, sign-in emails, AI reports), so features can be slow or
          unavailable at times. It may change or stop; if it stops, we’ll try to give notice so you
          can export your data.
        </p>
      </Section>

      <Section title="Who can use it">
        <p>
          You must be 18 or older. If you use SideBySide for an organisation, you confirm you’re
          allowed to accept these terms for it.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          Keep your email and sign-in accounts secure: you’re responsible for what happens under
          your account. You can delete it at any time from Settings.
        </p>
      </Section>

      <Section title="Running interviews">
        <p>If you run interviews with SideBySide:</p>
        <List>
          <li>
            You’re responsible for having a lawful reason to record and assess candidates, and for
            following the hiring and data-protection laws that apply to you. SideBySide shows every
            participant a recording notice before they join.
          </li>
          <li>
            Activity signals and AI reports are aids, not verdicts. A paste or a tab switch has many
            innocent explanations, and AI reports can be wrong. Don’t make a hiring decision on them
            alone; a person should review the session.
          </li>
          <li>
            Anyone with a room’s link can join as a guest while it’s open, so invite only the people
            you mean to.
          </li>
          <li>
            Rooms are deleted when their retention period ends and can’t be recovered, so keep
            anything you need before then.
          </li>
        </List>
      </Section>

      <Section title="Acceptable use">
        <p>Don’t use SideBySide to:</p>
        <List>
          <li>break the law, harass anyone, or record people without telling them;</li>
          <li>
            run code that attacks, scans or overloads other systems, mines cryptocurrency, or
            misuses Wandbox or the other services SideBySide relies on;
          </li>
          <li>
            get around rate limits, permissions or the code sandbox, or reach rooms and data that
            aren’t yours;
          </li>
          <li>send sign-in emails to addresses that aren’t yours;</li>
          <li>upload malware, or content you don’t have the right to share;</li>
          <li>scrape the service or put heavy automated load on it.</li>
        </List>
        <p>We may remove content, end sessions or suspend accounts that break these rules.</p>
      </Section>

      <Section title="Your content">
        <p>
          You keep ownership of what you write and upload. You allow SideBySide to store, process
          and show it as needed to run the service (for example to sync rooms, run code, write
          reports and show replays) and to send it to the services listed on the Privacy page.
          Questions you add to your question bank are visible only to you, until you show one in a
          room.
        </p>
      </Section>

      <Section title="Other services">
        <p>
          Signing in with Google or GitHub, and running code on Wandbox, are also covered by those
          services’ own terms.
        </p>
      </Section>

      <Section title="No warranties">
        <p>
          As far as the law allows, SideBySide comes without warranties of any kind, including that
          code runs, test results, scores, activity signals or AI reports are accurate or complete.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          As far as the law allows, we aren’t liable for indirect or consequential losses, for lost
          data, or for decisions, including hiring decisions, made using SideBySide.
        </p>
      </Section>

      <Section title="Ending">
        <p>
          You can stop using SideBySide and delete your account at any time. We may suspend or end
          access for anyone who breaks these terms.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update these terms; the date at the top changes when we do. Using SideBySide after
          a change means you accept the new terms.
        </p>
      </Section>

      <Section title="Law">
        <p>These terms are governed by the laws of India.</p>
      </Section>

      <Contact />
    </LegalPage>
  );
}
