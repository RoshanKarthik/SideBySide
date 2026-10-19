import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { AppShell } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Spinner } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/form';
import { api } from '@/lib/api';
import { authClient, useSession } from '@/lib/auth-client';

function safeNext(next: string | null): string {
  // Only same-site paths, never "//host" or absolute URLs.
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Continue with Google',
  github: 'Continue with GitHub',
};

export function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { data: session, isPending } = useSession();
  const providers = useQuery({
    queryKey: ['auth-providers'],
    queryFn: () => api.json<{ providers: string[] }>('/auth-providers'),
  });
  const [error, setError] = useState<string | null>(null);

  if (session) return <Navigate to={next} replace />;

  const social = providers.data?.providers.filter((p) => p !== 'dev') ?? [];
  const devLogin = providers.data?.providers.includes('dev') ?? false;

  return (
    <AppShell>
      <div className="mx-auto max-w-sm px-4 py-16">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Interviewers sign in to create rooms. Candidates don&apos;t need an account.
          </p>
          <div className="mt-6 space-y-3">
            {(isPending || providers.isPending) && <Spinner />}
            {error && <ErrorNote>{error}</ErrorNote>}
            {social.map((p) => (
              <Button
                key={p}
                variant="outline"
                className="w-full"
                onClick={async () => {
                  setError(null);
                  const res = await authClient.signIn.social({ provider: p, callbackURL: next });
                  if (res.error) setError(res.error.message ?? 'Sign-in failed');
                }}
              >
                {PROVIDER_LABELS[p] ?? p}
              </Button>
            ))}
            {providers.data && !social.length && !devLogin && (
              <ErrorNote>No sign-in method is configured on this server yet.</ErrorNote>
            )}
            {devLogin && <DevLogin next={next} onError={setError} />}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

/** Email + password, enabled only when the server sets ALLOW_DEV_LOGIN (local testing). */
function DevLogin({ next, onError }: { next: string; onError: (e: string | null) => void }) {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
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
    <form onSubmit={submit} className="space-y-3 border-t pt-4">
      <p className="text-xs font-medium text-warning">Development sign-in</p>
      {mode === 'signUp' && (
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required autoComplete="name" />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Spinner />}
        {mode === 'signUp' ? 'Create account' : 'Sign in'}
      </Button>
      <button
        type="button"
        className="w-full text-center text-xs text-muted-foreground hover:underline"
        onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
      >
        {mode === 'signIn' ? 'No account? Create one' : 'Have an account? Sign in'}
      </button>
    </form>
  );
}
