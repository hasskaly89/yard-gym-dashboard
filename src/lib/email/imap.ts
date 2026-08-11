import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

// Reads recent inbox emails over IMAP using a Gmail App Password (the same kind
// of credential already used for SMTP sending). No Google Cloud / OAuth needed.
// Returns a compact list for the AI to summarise — subject, sender, date, and a
// trimmed text snippet (keeps token cost down).

export type EmailAccount = {
  user: string;
  appPassword: string;
};

export type FetchedEmail = {
  from: string;
  subject: string;
  date: string;
  snippet: string;
};

// Reads the account config for a scope from env. Returns null if not configured
// (so the agent degrades gracefully to a "connect your inbox" state).
export function emailAccountFor(scope: 'personal' | 'business'): EmailAccount | null {
  const prefix = scope === 'personal' ? 'GMAIL_PERSONAL' : 'GMAIL_BUSINESS';
  const user = process.env[`${prefix}_USER`];
  const appPassword = process.env[`${prefix}_APP_PASSWORD`];
  if (!user || !appPassword) return null;
  return { user, appPassword };
}

const SNIPPET_MAX = 800;

export async function fetchRecentEmails(
  account: EmailAccount,
  opts?: { sinceDays?: number; max?: number },
): Promise<FetchedEmail[]> {
  const sinceDays = opts?.sinceDays ?? 3;
  const max = opts?.max ?? 40;
  const since = new Date(Date.now() - sinceDays * 86400000);

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: account.user, pass: account.appPassword },
    logger: false,
  });

  const out: FetchedEmail[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const found = await client.search({ since }, { uid: true });
      const uids = Array.isArray(found) ? found : [];
      const recent = uids.slice(-max);
      if (recent.length === 0) return out;
      for await (const msg of client.fetch(
        recent.join(','),
        { envelope: true, source: true },
        { uid: true },
      )) {
        let snippet = '';
        try {
          const parsed = await simpleParser(msg.source as Buffer);
          snippet = (parsed.text ?? '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_MAX);
        } catch {
          snippet = '';
        }
        const fromAddr =
          msg.envelope?.from?.[0]?.address ?? msg.envelope?.from?.[0]?.name ?? 'unknown';
        out.push({
          from: fromAddr,
          subject: msg.envelope?.subject ?? '(no subject)',
          date: (msg.envelope?.date ?? new Date()).toISOString(),
          snippet,
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  // Newest first
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
