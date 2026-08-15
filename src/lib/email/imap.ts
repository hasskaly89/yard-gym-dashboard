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
  url: string | null;
  // Recipients, used to tell "addressed directly to Hassan" apart from "CC'd on
  // a thread" when pre-scoring emails for the brief. Optional so older stored
  // briefs (and any caller that doesn't need them) still typecheck.
  to?: string[];
  cc?: string[];
  // RFC822 Message-ID (and Gmail's thread id where available) — the keys used
  // to work out whether Hassan has already replied to this email.
  messageId?: string;
  threadId?: string;
  // Carries a List-Unsubscribe header. That header is what bulk/commercial
  // senders are required to set, so it identifies marketing far more reliably
  // than guessing from the sender address — a promo from a real-looking
  // address otherwise scores as a genuine question just for containing "?".
  isBulk?: boolean;
};

/** Strip angle brackets and case so Message-IDs compare reliably. */
export function normaliseMessageId(raw: string): string {
  return raw.trim().replace(/^</, '').replace(/>$/, '').toLowerCase();
}

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
        let url: string | null = null;
        let messageId: string | undefined;
        let isBulk = false;
        try {
          const parsed = await simpleParser(msg.source as Buffer);
          snippet = (parsed.text ?? '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_MAX);
          // NOTE: parsed.headers is a CURATED subset and omits list-* headers
          // entirely — checking it there silently returns false for every
          // marketing email. headerLines carries the full raw set.
          isBulk = (parsed.headerLines ?? []).some(
            (h) => h.key.toLowerCase() === 'list-unsubscribe',
          );
          if (parsed.messageId) {
            messageId = normaliseMessageId(parsed.messageId);
            url = `https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(parsed.messageId.replace(/[<>]/g, ''))}`;
          }
        } catch {
          snippet = '';
        }
        const fromAddr =
          msg.envelope?.from?.[0]?.address ?? msg.envelope?.from?.[0]?.name ?? 'unknown';
        const addrs = (list: { address?: string }[] | undefined) =>
          (list ?? []).map((a) => a.address ?? '').filter(Boolean);
        out.push({
          from: fromAddr,
          subject: msg.envelope?.subject ?? '(no subject)',
          date: (msg.envelope?.date ?? new Date()).toISOString(),
          snippet,
          url,
          messageId,
          isBulk,
          to: addrs(msg.envelope?.to),
          cc: addrs(msg.envelope?.cc),
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

// Message-IDs that Hassan has already replied to, read from the Sent mailbox.
//
// A reply carries the original's Message-ID in its In-Reply-To / References
// headers, so ONE pass over Sent yields every answered message — rather than a
// per-email lookup. Without this, a question stays flagged "unanswered" forever
// after it's been dealt with, which is exactly the cry-wolf behaviour that made
// the old brief feel untrustworthy.
const SENT_MAILBOXES = ['[Gmail]/Sent Mail', 'Sent', 'INBOX.Sent'];

export async function findRepliedMessageIds(
  account: EmailAccount,
  opts?: { sinceDays?: number },
): Promise<Set<string>> {
  const since = new Date(Date.now() - (opts?.sinceDays ?? 14) * 86400000);
  const replied = new Set<string>();

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: account.user, pass: account.appPassword },
    logger: false,
  });

  await client.connect();
  try {
    let lock: { release: () => void } | null = null;
    for (const box of SENT_MAILBOXES) {
      try {
        lock = await client.getMailboxLock(box);
        break;
      } catch {
        // try the next candidate name
      }
    }
    if (!lock) return replied;

    try {
      const found = await client.search({ since }, { uid: true });
      const uids = Array.isArray(found) ? found : [];
      if (uids.length === 0) return replied;

      for await (const msg of client.fetch(
        uids.slice(-200).join(','),
        { headers: ['in-reply-to', 'references'] },
        { uid: true },
      )) {
        const raw = (msg.headers as Buffer | undefined)?.toString() ?? '';
        for (const id of raw.match(/<[^<>@\s]+@[^<>\s]+>/g) ?? []) {
          replied.add(normaliseMessageId(id));
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return replied;
}
