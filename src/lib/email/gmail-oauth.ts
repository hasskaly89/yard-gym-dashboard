import { createAdminClient } from '@/lib/supabase/admin';
import { normaliseMessageId, type FetchedEmail } from './imap';

// Business inbox access via Google OAuth. The Yard's Workspace admin disables
// Gmail app passwords, so this scope can't use the IMAP + app-password path
// in imap.ts — it talks to the Gmail API directly instead, using a stored
// refresh token exchanged for a short-lived access token on each run.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const SNIPPET_MAX = 800;

type OAuthScope = 'personal' | 'business';

type GmailHeader = { name: string; value: string };
type GmailMessagePart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
};
type GmailMessage = {
  id?: string;
  threadId?: string;
  internalDate: string;
  snippet?: string;
  payload?: GmailMessagePart & { headers?: GmailHeader[] };
};

function oauthEnv() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function getAuthUrl(scope: OAuthScope): string | null {
  const env = oauthEnv();
  if (!env) return null;
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: scope,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForRefreshToken(code: string): Promise<string | null> {
  const env = oauthEnv();
  if (!env) return null;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: env.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.refresh_token ?? null;
}

export async function storeRefreshToken(scope: OAuthScope, refreshToken: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from('gmail_oauth_tokens').upsert(
    { scope, refresh_token: refreshToken, updated_at: new Date().toISOString() },
    { onConflict: 'scope' },
  );
}

export async function isOAuthConnected(scope: OAuthScope): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('gmail_oauth_tokens')
    .select('scope')
    .eq('scope', scope)
    .maybeSingle();
  return !!data;
}

async function getAccessToken(scope: OAuthScope): Promise<string | null> {
  const env = oauthEnv();
  if (!env) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('gmail_oauth_tokens')
    .select('refresh_token')
    .eq('scope', scope)
    .maybeSingle();
  if (!data?.refresh_token) return null;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: data.refresh_token,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.access_token ?? null;
}

function decodeBase64Url(input: string): string {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function extractHeader(headers: GmailHeader[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

// Prefers the plain-text MIME part; multipart messages nest parts recursively.
function extractPlainText(part: GmailMessagePart | undefined): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  for (const child of part.parts ?? []) {
    const found = extractPlainText(child);
    if (found) return found;
  }
  return '';
}

export async function fetchRecentEmailsOAuth(
  scope: OAuthScope,
  opts?: { sinceDays?: number; max?: number },
): Promise<FetchedEmail[]> {
  const accessToken = await getAccessToken(scope);
  if (!accessToken) return [];

  const sinceDays = opts?.sinceDays ?? 3;
  const max = opts?.max ?? 40;
  const q = `newer_than:${sinceDays}d in:inbox`;
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${max}`,
    { headers: authHeader },
  );
  if (!listRes.ok) return [];
  const listJson: { messages?: { id: string }[] } = await listRes.json();
  const ids = (listJson.messages ?? []).map((m) => m.id);

  const out: FetchedEmail[] = [];
  for (const id of ids) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      { headers: authHeader },
    );
    if (!msgRes.ok) continue;
    const msg: GmailMessage = await msgRes.json();
    const headers = msg.payload?.headers ?? [];
    const snippet =
      extractPlainText(msg.payload).replace(/\s+/g, ' ').trim().slice(0, SNIPPET_MAX) ||
      (msg.snippet ?? '');
    // "Name <addr@x.com>, other@y.com" → ["addr@x.com", "other@y.com"]
    const addrList = (header: string): string[] =>
      (extractHeader(headers, header).match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? []).map((a) =>
        a.toLowerCase(),
      );
    out.push({
      from: extractHeader(headers, 'From'),
      subject: extractHeader(headers, 'Subject') || '(no subject)',
      date: new Date(Number(msg.internalDate)).toISOString(),
      snippet,
      url: `https://mail.google.com/mail/u/0/#all/${id}`,
      to: addrList('To'),
      cc: addrList('Cc'),
      messageId: normaliseMessageId(extractHeader(headers, 'Message-ID')),
      threadId: msg.threadId,
      isBulk: extractHeader(headers, 'List-Unsubscribe') !== '',
    });
  }

  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Of the given emails, which has Hassan already answered?
 *
 * Checks each email's thread for a later message sent by one of his own
 * addresses. Deliberately takes only the CANDIDATES worth checking (the caller
 * passes the handful that already look like direct questions) rather than every
 * fetched email, so this stays a few extra calls per run instead of one per
 * message. Returns the set of replied-to Message-IDs.
 */
export async function findRepliedMessageIdsOAuth(
  scope: OAuthScope,
  candidates: FetchedEmail[],
  ownerAddresses: Set<string>,
): Promise<Set<string>> {
  const replied = new Set<string>();
  if (candidates.length === 0) return replied;

  const accessToken = await getAccessToken(scope);
  if (!accessToken) return replied;
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  // Unique threads only — several candidates can share one thread.
  const byThread = new Map<string, FetchedEmail[]>();
  for (const e of candidates) {
    if (!e.threadId || !e.messageId) continue;
    const list = byThread.get(e.threadId) ?? [];
    list.push(e);
    byThread.set(e.threadId, list);
  }

  for (const [threadId, mails] of byThread) {
    try {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=From`,
        { headers: authHeader },
      );
      if (!res.ok) continue;
      const thread: { messages?: GmailMessage[] } = await res.json();

      for (const mail of mails) {
        const sentAt = new Date(mail.date).getTime();
        const answered = (thread.messages ?? []).some((m) => {
          const from = extractHeader(m.payload?.headers ?? [], 'From').toLowerCase();
          const fromOwner = [...ownerAddresses].some((a) => from.includes(a));
          return fromOwner && Number(m.internalDate) > sentAt;
        });
        if (answered) replied.add(mail.messageId!);
      }
    } catch {
      // A thread lookup failing just means we don't know — leave it unflagged
      // rather than guessing it was answered.
    }
  }

  return replied;
}
