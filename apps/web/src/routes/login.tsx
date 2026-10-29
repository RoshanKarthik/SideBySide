import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FlaskConical, MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { AuthLayout, GitHubIcon, GoogleIcon } from '@/components/marketing/auth-layout';
import { coverScreen, openScreen } from '@/components/sign-in-curtain';
import { Button } from '@/components/ui/button';
import { ErrorNote, Skeleton, Spinner } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { api } from '@/lib/api';
import { authClient, useSession } from '@/lib/auth-client';

function safeNext(next: string | null): string {
  // Only same-site paths, never "//host" or absolute URLs.
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

const PROVIDERS: Record<string, { label: string; icon: () => React.JSX.Element }> = {
  google: { label: 'Continue with Google', icon: GoogleIcon },
  github: { label: 'Continue with GitHub', icon: GitHubIcon },
};

export default function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const signUp = params.get('mode') === 'signup';
  const { data: session } = useSession();
  const providers = useQuery({
    queryKey: ['auth-providers'],
    queryFn: () => api.json<{ providers: string[] }>('/auth-providers'),
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  // While the sign-in curtain plays, the page loads the next one itself.
  const [leaving, setLeaving] = useState(false);

  if (session && !leaving) return <Navigate to={next} replace />;

  const social = providers.data?.providers.filter((p) => p !== 'dev' && p !== 'email') ?? [];
  const devLogin = providers.data?.providers.includes('dev') ?? false;
  const emailLinks = providers.data?.providers.includes('email') ?? false;
  // Set by the server when a sign-in link has expired or was already used.
  const linkFailed = params.has('error');
  const invited = next.includes('invite=');
  const claiming = next.startsWith('/claim/');

  return (
    <AuthLayout>
      <h1 className="text-3xl font-semibold tracking-tight">
        {signUp ? 'Create your account' : 'Welcome back'}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {invited
          ? 'Sign in to join the room as a co-interviewer.'
          : claiming
            ? 'Your interview, and the feedback shared with you, will be saved to this account.'
            : 'Interviewers sign in to create rooms. Candidates join from a link — no account needed.'}
      </p>
      <div className="mt-8 space-y-3">
        {providers.isPending && (
          <>
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        {linkFailed && !error && (
          <ErrorNote>
            That sign-in link has expired or was already used. Ask for a new one.
          </ErrorNote>
        )}
        {social.map((p) => {
          const info = PROVIDERS[p];
          const Icon = info?.icon;
          return (
            <Button
              key={p}
              variant="outline"
              size="lg"
              className="w-full"
              disabled={pending !== null}
              onClick={async (e) => {
                setError(null);
                setPending(p);
                // The curtain covers the screen while the browser heads to the provider, and
                // opens on the page it comes back to.
                void coverScreen(e.currentTarget, 'Signing you in…');
                const res = await authClient.signIn.social({ provider: p, callbackURL: next });
                if (res.error) {
                  openScreen();
                  setPending(null);
                  setError(res.error.message ?? 'Sign-in failed');
                }
              }}
            >
              {pending === p ? <Spinner /> : Icon && <Icon />}
              {info?.label ?? p}
            </Button>
          );
        })}
        {emailLinks && <EmailLink next={next} signUp={signUp} hasSocial={social.length > 0} />}
        {providers.data && !social.length && !emailLinks && !devLogin && (
          <ErrorNote>No sign-in method is configured on this server yet.</ErrorNote>
        )}
        {devLogin && (
          <DevLogin
            next={next}
            initialMode={signUp ? 'signUp' : 'signIn'}
            onError={setError}
            onLeaving={setLeaving}
            hasSocial={social.length > 0}
          />
        )}
      </div>
    </AuthLayout>
  );
}

/** Sign in (or sign up) with a link sent by email; no password. */
function EmailLink({
  next,
  signUp,
  hasSocial,
}: {
  next: string;
  signUp: boolean;
  hasSocial: boolean;
}) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get('link-email')).trim();
    const name = String(form.get('link-name') ?? '').trim();
    setError(null);
    setBusy(true);
    const res = await authClient.signIn.magicLink({
      email,
      ...(name ? { name } : {}),
      callbackURL: next,
      newUserCallbackURL: next,
      errorCallbackURL: `/login?next=${encodeURIComponent(next)}`,
    });
    setBusy(false);
    if (res.error) setError(res.error.message ?? 'The link could not be sent');
    else setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="rounded-xl border bg-card p-5 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <MailCheck className="size-4 text-success" /> Check your email
        </p>
        <p className="mt-1 text-muted-foreground">
          We sent a sign-in link to <span className="font-medium text-foreground">{sentTo}</span>.
          It works once, for 10 minutes. Check your spam folder if it isn’t there in a minute.
        </p>
        <button
          type="button"
          className="mt-3 text-sm font-medium text-primary"
          onClick={() => setSentTo(null)}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {hasSocial && (
        <div className="flex items-center gap-3 py-2 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      {signUp && (
        <Field label="Full name" htmlFor="link-name">
          <Input id="link-name" name="link-name" autoComplete="name" placeholder="Priya Sharma" />
        </Field>
      )}
      <Field label="Email address" htmlFor="link-email">
        <Input
          id="link-email"
          name="link-email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
        />
      </Field>
      <Button type="submit" size="lg" variant="outline" className="w-full" disabled={busy}>
        {busy && <Spinner />} Email me a sign-in link
      </Button>
    </form>
  );
}

/** Email + password, enabled only when the server sets ALLOW_DEV_LOGIN (local testing). */
function DevLogin({
  next,
  initialMode,
  hasSocial,
  onError,
  onLeaving,
}: {
  next: string;
  initialMode: 'signIn' | 'signUp';
  hasSocial: boolean;
  onError: (e: string | null) => void;
  onLeaving: (leaving: boolean) => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email'));
    const password = String(form.get('password'));
    const button = (e.nativeEvent as SubmitEvent).submitter;
    onError(null);
    setBusy(true);
    onLeaving(true);
    const res =
      mode === 'signUp'
        ? await authClient.signUp.email({ email, password, name: String(form.get('name')) })
        : await authClient.signIn.email({ email, password });
    if (res.error) {
      setBusy(false);
      onLeaving(false);
      onError(res.error.message ?? 'Sign-in failed');
      return;
    }
    await coverScreen(button, mode === 'signUp' ? 'Setting up your account…' : 'Signing you in…');
    window.location.assign(next);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {hasSocial && (
        <div className="flex items-center gap-3 py-2 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>
      )}
      <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
        <FlaskConical className="size-3.5" /> Development sign-in
      </p>
      {mode === 'signUp' && (
        <Field label="Name" htmlFor="name">
          <Input id="name" name="name" required autoComplete="name" placeholder="Priya Sharma" />
        </Field>
      )}
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
        />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        hint={mode === 'signUp' ? 'At least 8 characters.' : undefined}
      >
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? <Spinner /> : null}
        {mode === 'signUp' ? 'Create account' : 'Sign in'}
        {!busy && <ArrowRight />}
      </Button>
      <button
        type="button"
        className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
        onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
      >
        {mode === 'signIn' ? (
          <>
            No account? <span className="font-medium text-primary">Create one</span>
          </>
        ) : (
          <>
            Have an account? <span className="font-medium text-primary">Sign in</span>
          </>
        )}
      </button>
    </form>
  );
}
