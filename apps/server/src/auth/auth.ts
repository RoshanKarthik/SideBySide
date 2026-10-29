import { schema, type Database } from '@sidebyside/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { magicLink } from 'better-auth/plugins/magic-link';
import type { Mailer } from '../email/mailer';
import { SIGN_IN_LINK_MINUTES, signInEmail, takeSignInEmailSlot } from '../email/sign-in-email';

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
 * (Hyperdrive pools them). Accounts live in our own Postgres tables. With a mailer, people can
 * also sign in (and sign up) with a link sent to their email.
 */
export function createAuth(env: Env, db: Database, mailer: Mailer | null = null) {
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
    // Local testing only: passwords are never offered in production.
    emailAndPassword: { enabled: env.ALLOW_DEV_LOGIN === 'true' },
    plugins: mailer
      ? [
          magicLink({
            expiresIn: SIGN_IN_LINK_MINUTES * 60,
            sendMagicLink: async ({ email, url }) => {
              const slot = await takeSignInEmailSlot(db, email);
              if (slot === 'address') {
                throw new APIError('TOO_MANY_REQUESTS', {
                  message: 'Too many sign-in links for this address. Try again in 15 minutes.',
                });
              }
              if (slot === 'daily') {
                throw new APIError('TOO_MANY_REQUESTS', {
                  message: 'Sign-in by email is busy today. Use Google or GitHub, or try tomorrow.',
                });
              }
              await mailer.send(signInEmail(email, url));
            },
          }),
        ]
      : [],
    databaseHooks: {
      user: {
        create: {
          // Email sign-ups may come without a name; start from the address until they set one.
          before: async (user) => ({
            data: { ...user, name: user.name?.trim() || user.email.split('@')[0] },
          }),
        },
      },
    },
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

export function enabledProviders(env: Env, emailLinks = false): string[] {
  const providers: string[] = [];
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) providers.push('google');
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) providers.push('github');
  if (emailLinks) providers.push('email');
  if (env.ALLOW_DEV_LOGIN === 'true') providers.push('dev');
  return providers;
}
