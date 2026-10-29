/**
 * Email sign-in: a link is sent, works once and signs the person in (creating the account on
 * first use); sending is capped per address and per day.
 */
import { signInEmails } from '@sidebyside/db';
import type { Me } from '@sidebyside/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness } from '../testing/harness';
import {
  SIGN_IN_EMAILS_PER_ADDRESS,
  SIGN_IN_EMAILS_PER_DAY,
  forgetOldSignInEmails,
} from './sign-in-email';

let h: Awaited<ReturnType<typeof createHarness>>;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

const requestLink = (email: string, extra: Record<string, string> = {}) =>
  h.call('/api/auth/sign-in/magic-link', {
    method: 'POST',
    body: JSON.stringify({ email, callbackURL: '/dashboard', ...extra }),
  });

/** The link from the last email to this address, as a path on the app. */
function lastLinkTo(email: string): string {
  const message = h.sentEmails.findLast((m) => m.to === email);
  const url = message?.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error(`No link was sent to ${email}`);
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
}

const sessionCookie = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

describe('email sign-in links', () => {
  it('is offered when the server can send email', async () => {
    const { providers } = await h.json<{ providers: string[] }>('/api/auth-providers');
    expect(providers).toContain('email');
  });

  it('signs a new person up with the name they gave, and the link works once', async () => {
    const res = await requestLink('asha.link@example.test', { name: 'Asha Rao' });
    expect(res.status).toBe(200);
    const message = h.sentEmails.at(-1)!;
    expect(message.subject).toBe('Your SideBySide sign-in link');
    expect(message.html).toContain('Sign in to SideBySide');

    const link = lastLinkTo('asha.link@example.test');
    const verified = await h.call(link, { redirect: 'manual' });
    expect(verified.status).toBe(302);
    expect(verified.headers.get('location')).toContain('/dashboard');
    const cookie = sessionCookie(verified);
    const me = await h.json<Me>('/api/me', { cookie });
    expect(me).toMatchObject({ email: 'asha.link@example.test', displayName: 'Asha Rao' });

    const again = await h.call(link, { redirect: 'manual' });
    expect(again.headers.get('location')).toContain('error=');
  });

  it('names an account after its address when no name was given', async () => {
    await requestLink('ravi.k@example.test');
    const verified = await h.call(lastLinkTo('ravi.k@example.test'), { redirect: 'manual' });
    const me = await h.json<Me>('/api/me', { cookie: sessionCookie(verified) });
    expect(me.displayName).toBe('ravi.k');
  });

  it('sends one address only a few links in a quarter of an hour', async () => {
    const email = 'busy@example.test';
    for (let i = 0; i < SIGN_IN_EMAILS_PER_ADDRESS; i++) {
      expect((await requestLink(email)).status).toBe(200);
    }
    const sent = h.mailer.send.mock.calls.length;
    const res = await requestLink(email);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ message: expect.stringContaining('15 minutes') });
    expect(h.mailer.send.mock.calls.length).toBe(sent);
  });

  it('stops for the day at the daily cap', async () => {
    const now = new Date();
    await h.db.insert(signInEmails).values(
      Array.from({ length: SIGN_IN_EMAILS_PER_DAY }, (_, i) => ({
        emailHash: `filler-${i}`,
        sentAt: now,
      })),
    );
    const res = await requestLink('late@example.test');
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ message: expect.stringContaining('busy today') });
  });

  it('forgets records older than a day', async () => {
    const tomorrow = new Date(Date.now() + 25 * 60 * 60 * 1000);
    await forgetOldSignInEmails(h.db, tomorrow);
    expect(await h.db.select().from(signInEmails)).toHaveLength(0);
  });
});
