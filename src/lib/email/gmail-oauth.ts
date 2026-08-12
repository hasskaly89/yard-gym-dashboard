import { createAdminClient } from '@/lib/supabase/admin';
import type { FetchedEmail } from './imap';

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
    out.push({
      from: extractHeader(headers, 'From'),
      subject: extractHeader(headers, 'Subject') || '(no subject)',
      date: new Date(Number(msg.internalDate)).toISOString(),
      snippet,
    });
  }

  return out.sort((a, b) => b.date.localeCompare(a.date));
}
