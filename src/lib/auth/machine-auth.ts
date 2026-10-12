import { timingSafeEqual } from 'crypto';

// Scheduled jobs and the Mindbody webhook cannot carry a logged-in session.
// Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when that env var
// is set. SYNC_SECRET is the older manual-trigger secret and still works.
// The `x-vercel-cron: 1` header is not a secret — anyone can send it — so it
// is never accepted on its own.
//
// Fail closed when no secret is configured. An empty env var used to skip
// the check entirely (`if (secret && header !== ...)`).

const CRON_ENV_NAMES = ['CRON_SECRET', 'SYNC_SECRET'] as const;

export const MACHINE_ROUTES = new Set([
  '/api/milestones/cron',
  '/api/cron/eod-summary',
  '/api/dashboard/brief-cron',
  '/api/mindbody/sync-refresh',
  '/api/mindbody/sync-members',
  '/api/gohighlevel/backfill-contacts',
  '/api/mindbody/webhooks',
]);

export function isMachineRoute(pathname: string): boolean {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return MACHINE_ROUTES.has(path);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  const len = Math.max(ab.length, bb.length, 1);
  const ap = Buffer.alloc(len);
  const bp = Buffer.alloc(len);
  ab.copy(ap);
  bb.copy(bp);
  return timingSafeEqual(ap, bp) && ab.length === bb.length;
}

function secretsFrom(names: readonly string[]): string[] {
  const values: string[] = [];
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.length > 0) values.push(value);
  }
  return values;
}

function matchesAny(candidate: string, secrets: string[]): boolean {
  if (!candidate || secrets.length === 0) return false;
  let ok = false;
  for (const secret of secrets) {
    if (safeEqual(candidate, secret)) ok = true;
  }
  return ok;
}

/** Bearer CRON_SECRET or SYNC_SECRET. Used by cron and manual sync routes. */
export function bearerAuthorized(req: Request, extraEnvNames: readonly string[] = []): boolean {
  const header = req.headers.get('authorization') ?? '';
  return matchesAny(header, secretsFrom([...CRON_ENV_NAMES, ...extraEnvNames]).map((s) => `Bearer ${s}`));
}

/**
 * `?token=` on the Mindbody subscription URL, for providers that cannot set
 * an Authorization header. Accepted only on the webhook, not on cron routes,
 * so a URL leaked from Mindbody's dashboard cannot trigger the nightly send.
 */
export function webhookTokenAuthorized(req: Request): boolean {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  return matchesAny(token, secretsFrom([...CRON_ENV_NAMES, 'MINDBODY_WEBHOOK_SECRET']));
}
