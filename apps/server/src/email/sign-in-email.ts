import { and, count, eq, gte, lt, signInEmails, type Database } from '@sidebyside/db';
import type { EmailMessage } from './mailer';

/** Links one address can be sent in a quarter of an hour. */
export const SIGN_IN_EMAILS_PER_ADDRESS = 3;
const PER_ADDRESS_WINDOW_MS = 15 * 60 * 1000;
/** Sign-in emails the app sends a day: under Gmail's 500, so the account stays in good standing. */
export const SIGN_IN_EMAILS_PER_DAY = 400;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How long a sign-in link works. */
export const SIGN_IN_LINK_MINUTES = 10;

async function hashEmail(email: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(email.trim().toLowerCase()),
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Records a sign-in email about to be sent, or says why it can't be: too many for this address
 * recently, or too many today. Only a hash of the address is kept.
 */
export async function takeSignInEmailSlot(
  db: Database,
  email: string,
  now = new Date(),
): Promise<'ok' | 'address' | 'daily'> {
  const emailHash = await hashEmail(email);
  const [recent] = await db
    .select({ n: count() })
    .from(signInEmails)
    .where(
      and(
        eq(signInEmails.emailHash, emailHash),
        gte(signInEmails.sentAt, new Date(now.getTime() - PER_ADDRESS_WINDOW_MS)),
      ),
    );
  if ((recent?.n ?? 0) >= SIGN_IN_EMAILS_PER_ADDRESS) return 'address';
  const [today] = await db
    .select({ n: count() })
    .from(signInEmails)
    .where(gte(signInEmails.sentAt, new Date(now.getTime() - DAY_MS)));
  if ((today?.n ?? 0) >= SIGN_IN_EMAILS_PER_DAY) return 'daily';
  await db.insert(signInEmails).values({ emailHash, sentAt: now });
  return 'ok';
}

/** Hourly cleanup: rows older than a day are no longer needed for the limits. */
export async function forgetOldSignInEmails(db: Database, now = new Date()): Promise<void> {
  await db.delete(signInEmails).where(lt(signInEmails.sentAt, new Date(now.getTime() - DAY_MS)));
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function signInEmail(to: string, url: string): EmailMessage {
  const text = [
    'Use this link to sign in to SideBySide:',
    '',
    url,
    '',
    `It works once and expires in ${SIGN_IN_LINK_MINUTES} minutes. If you didn't ask to sign in, you can ignore this email.`,
  ].join('\n');
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1f2430">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
    <h1 style="margin:0 0 12px;font-size:20px">Sign in to SideBySide</h1>
    <p style="margin:0 0 24px;line-height:1.5">Click the button to sign in. The link works once and expires in ${SIGN_IN_LINK_MINUTES} minutes.</p>
    <a href="${escapeHtml(url)}" style="display:inline-block;background:#3d5af1;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Sign in</a>
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.5">If you didn't ask to sign in, you can ignore this email.</p>
  </div>
</body></html>`;
  return { to, subject: 'Your SideBySide sign-in link', text, html };
}
