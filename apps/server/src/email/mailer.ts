export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends email; swappable so tests (and another provider later) can replace SMTP. */
export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  fromName: string;
}

/**
 * Sends through an SMTP account over TLS, with Cloudflare's TCP sockets. Set up for a Gmail
 * account with an App Password: mail then comes from that address and passes Gmail's checks,
 * which no free service can offer without a domain of your own.
 */
export function smtpMailer(config: SmtpConfig): Mailer {
  return {
    async send(message) {
      // Loaded on use: it needs `cloudflare:sockets`, which exists only in the Worker runtime.
      const { WorkerMailer } = await import('worker-mailer');
      await WorkerMailer.send(
        {
          host: config.host,
          port: config.port,
          secure: config.port === 465,
          startTls: config.port !== 465,
          credentials: { username: config.user, password: config.password },
          authType: ['plain', 'login'],
          socketTimeoutMs: 15_000,
          responseTimeoutMs: 15_000,
        },
        {
          from: { name: config.fromName, email: config.user },
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        },
      );
    },
  };
}

/** Local development only: prints the message (and its sign-in link) to the Worker's log. */
export function logMailer(): Mailer {
  return {
    async send(message) {
      console.log(`[email to ${message.to}] ${message.subject}\n${message.text}`);
    },
  };
}

/**
 * SMTP when `SMTP_USER` and `SMTP_PASSWORD` are set; otherwise, with development sign-in on,
 * the log; otherwise no email (email sign-in is then off).
 */
export function mailerFromEnv(env: Env): Mailer | null {
  if (env.SMTP_USER && env.SMTP_PASSWORD) {
    return smtpMailer({
      host: env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(env.SMTP_PORT) || 465,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      fromName: 'SideBySide',
    });
  }
  return env.ALLOW_DEV_LOGIN === 'true' ? logMailer() : null;
}
