import { schema, type Database } from '@sidebyside/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

type SocialProviders = NonNullable<Parameters<typeof betterAuth>[0]['socialProviders']>;

export function allowedOrigins(env: Env): string[] {
  const extra = (env.TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return [new URL(env.PUBLIC_APP_URL).origin, ...extra];
}

/**
 * Better Auth, created per request because each request gets its own database connection
 * (Hyperdrive pools them). Accounts live in our own Postgres tables.
 */
export function createAuth(env: Env, db: Database) {
  const socialProviders: SocialProviders = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    socialProviders.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    };
  }

  return betterAuth({
    appName: 'SideBySide',
    baseURL: env.PUBLIC_APP_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'pg', usePlural: true, schema }),
    socialProviders,
    // Local testing only: there is no email sender, so this must stay off in production.
    emailAndPassword: { enabled: env.ALLOW_DEV_LOGIN === 'true' },
    user: {
      additionalFields: {
        defaultLanguage: { type: 'string', required: false, defaultValue: 'python', input: false },
        lowBandwidth: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },
    trustedOrigins: allowedOrigins(env),
    advanced: {
      database: { generateId: 'uuid' },
      // Privacy by design: we don't keep IP addresses.
      ipAddress: { disableIpTracking: true },
    },
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;

export function enabledProviders(env: Env): string[] {
  const providers: string[] = [];
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) providers.push('google');
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) providers.push('github');
  if (env.ALLOW_DEV_LOGIN === 'true') providers.push('dev');
  return providers;
}
