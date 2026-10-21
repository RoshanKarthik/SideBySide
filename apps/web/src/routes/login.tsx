import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FlaskConical } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { AuthLayout, GitHubIcon, GoogleIcon } from '@/components/marketing/auth-layout';
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

  if (session) return <Navigate to={next} replace />;

  const social = providers.data?.providers.filter((p) => p !== 'dev') ?? [];
  const devLogin = providers.data?.providers.includes('dev') ?? false;
  const invited = next.includes('invite=');

  return (
    <AuthLayout>
      <h1 className="text-3xl font-semibold tracking-tight">
        {signUp ? 'Create your account' : 'Welcome back'}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {invited
          ? 'Sign in to join the room as a co-interviewer.'
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
              onClick={async () => {
                setError(null);
                setPending(p);
                const res = await authClient.signIn.social({ provider: p, callbackURL: next });
                if (res.error) {
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
        {providers.data && !social.length && !devLogin && (
          <ErrorNote>No sign-in method is configured on this server yet.</ErrorNote>
        )}
        {devLogin && (
          <DevLogin
            next={next}
            initialMode={signUp ? 'signUp' : 'signIn'}
            onError={setError}
            hasSocial={social.length > 0}
          />
        )}
      </div>
    </AuthLayout>
  );
}

/** Email + password, enabled only when the server sets ALLOW_DEV_LOGIN (local testing). */
function DevLogin({
  next,
  initialMode,
  hasSocial,
  onError,
}: {
  next: string;
  initialMode: 'signIn' | 'signUp';
  hasSocial: boolean;
  onError: (e: string | null) => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email'));
    const password = String(form.get('password'));
    onError(null);
    setBusy(true);
    const res =
      mode === 'signUp'
        ? await authClient.signUp.email({ email, password, name: String(form.get('name')) })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (res.error) onError(res.error.message ?? 'Sign-in failed');
    else window.location.assign(next);
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
