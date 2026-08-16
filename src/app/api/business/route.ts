import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMBToken } from '@/lib/mindbody/api';
import { resolvePeriod, isPeriodKey, type Period } from '@/lib/periods';

// One endpoint answering "how is the business doing for <period>?" — money,
// visits, and leads, on the same Monday-start calendar for all three.
//
// COST: MindBody bills $0.002/call, so this deliberately avoids the per-member
// fan-out (activeclientmemberships / clientvisits / clientcontracts) that made
// up nearly all of the account's usage. Instead:
//   visits  → /class/classes, which reports TotalSignedIn PER CLASS. One call
//             covers a whole week (~135 classes), counts EVERYONE in the room,
//             and reproduces the MindBody Classes report exactly.
//   revenue → /sale/sales, 200 per page, ~3 calls for a month.
// A week therefore costs about half a cent instead of ~$2.50.
// GoHighLevel does not bill per call, so leads are filtered client-side.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MB = 'https://api.mindbodyonline.com/public/v6';
const GHL_V2 = 'https://services.leadconnectorhq.com';
const CACHE_TTL = 5 * 60 * 1000;

const cache = new Map<string, { at: number; data: unknown }>();

export type BusinessSummary = {
  period: { key: string; label: string; start: string; end: string; inProgress: boolean };
  revenue: { total: number; transactions: number; compare: number | null };
  visits: {
    signedIn: number;
    booked: number;
    capacity: number;
    classes: number;
    utilisation: number | null;
    compare: number | null;
  };
  leads: { created: number; won: number; open: number; compare: number | null } | null;
  costCalls: number;
  errors: string[];
};

function mbHeaders(token: string) {
  return {
    'Api-Key': process.env.MINDBODY_API_KEY ?? '',
    SiteId: process.env.MINDBODY_SITE_ID ?? '',
    Authorization: token,
    'Content-Type': 'application/json',
  };
}

/** Attendance from class-level totals — one call per ~200 classes. */
async function fetchVisits(token: string, startIso: string, endIso: string) {
  const url =
    `${MB}/class/classes?StartDateTime=${startIso.slice(0, 19)}` +
    `&EndDateTime=${endIso.slice(0, 19)}&limit=200`;
  const res = await fetch(url, { headers: mbHeaders(token), cache: 'no-store' });
  if (!res.ok) throw new Error(`class/classes ${res.status}`);
  const json: {
    Classes?: Array<{
      TotalSignedIn?: number;
      TotalBooked?: number;
      MaxCapacity?: number;
      IsCanceled?: boolean;
    }>;
  } = await res.json();

  const classes = (json.Classes ?? []).filter((c) => !c.IsCanceled);
  let signedIn = 0;
  let booked = 0;
  let capacity = 0;
  for (const c of classes) {
    signedIn += Number(c.TotalSignedIn ?? 0);
    booked += Number(c.TotalBooked ?? 0);
    capacity += Number(c.MaxCapacity ?? 0);
  }
  return {
    signedIn,
    booked,
    capacity,
    classes: classes.length,
    utilisation: capacity > 0 ? Math.round((signedIn / capacity) * 1000) / 10 : null,
  };
}

/** Revenue from sales, paging until the window is covered. */
async function fetchRevenue(token: string, startIso: string, endIso: string) {
  let total = 0;
  let transactions = 0;
  let offset = 0;
  let calls = 0;

  for (let page = 0; page < 12; page++) {
    const url =
      `${MB}/sale/sales?StartSaleDateTime=${startIso.slice(0, 19)}` +
      `&EndSaleDateTime=${endIso.slice(0, 19)}&limit=200&offset=${offset}`;
    const res = await fetch(url, { headers: mbHeaders(token), cache: 'no-store' });
    calls++;
    if (!res.ok) throw new Error(`sale/sales ${res.status}`);
    const json: {
      Sales?: Array<{ Payments?: Array<{ Amount?: number }> }>;
      PaginationResponse?: { TotalResults?: number };
    } = await res.json();

    const sales = json.Sales ?? [];
    for (const s of sales) {
      for (const p of s.Payments ?? []) total += Number(p.Amount ?? 0);
    }
    transactions += sales.length;

    const totalResults = json.PaginationResponse?.TotalResults ?? 0;
    offset += 200;
    if (sales.length === 0 || offset >= totalResults) break;
  }

  return { total: Math.round(total * 100) / 100, transactions, calls };
}

/** Leads created in the window, from the CRM. GHL is not billed per call. */
async function fetchLeads(startIso: string, endIso: string, pipelineId?: string) {
  const token = process.env.GHL_PRIVATE_TOKEN ?? '';
  const locationId = process.env.GHL_LOCATION_ID ?? '';
  if (!token || !locationId) return null;

  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  let created = 0;
  let won = 0;
  let open = 0;
  let cursor = '';

  // Results come newest-first, so stop once we're past the window's start.
  for (let page = 0; page < 12; page++) {
    const url =
      `${GHL_V2}/opportunities/search?location_id=${encodeURIComponent(locationId)}` +
      (pipelineId ? `&pipeline_id=${encodeURIComponent(pipelineId)}` : '') +
      `&limit=100${cursor}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28', Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) break;

    const json: {
      opportunities?: Array<{ createdAt?: string; status?: string }>;
      meta?: { startAfter?: number; startAfterId?: string };
    } = await res.json();

    const rows = json.opportunities ?? [];
    if (rows.length === 0) break;

    let reachedOlder = false;
    for (const o of rows) {
      const t = o.createdAt ? new Date(o.createdAt).getTime() : 0;
      if (t < startMs) {
        reachedOlder = true;
        continue;
      }
      if (t >= endMs) continue;
      created++;
      if (o.status === 'won') won++;
      else if (o.status === 'open') open++;
    }
    if (reachedOlder) break;

    const m = json.meta;
    if (!m?.startAfter || !m?.startAfterId) break;
    cursor = `&startAfter=${m.startAfter}&startAfterId=${m.startAfterId}`;
  }

  return { created, won, open };
}

async function build(period: Period, pipelineId?: string): Promise<BusinessSummary> {
  const errors: string[] = [];
  let costCalls = 0;

  const token = await getMBToken();
  costCalls++;

  const [visitsRes, revenueRes, leadsRes, visitsCmp, revenueCmp, leadsCmp] = await Promise.allSettled([
    fetchVisits(token, period.start, period.end),
    fetchRevenue(token, period.start, period.end),
    fetchLeads(period.start, period.end, pipelineId),
    fetchVisits(token, period.compare.start, period.compare.end),
    fetchRevenue(token, period.compare.start, period.compare.end),
    fetchLeads(period.compare.start, period.compare.end, pipelineId),
  ]);

  const ok = <T,>(r: PromiseSettledResult<T>, what: string): T | null => {
    if (r.status === 'fulfilled') return r.value;
    errors.push(`${what}: ${(r.reason as Error)?.message ?? 'failed'}`);
    return null;
  };

  const v = ok(visitsRes, 'visits');
  const rev = ok(revenueRes, 'revenue');
  const leads = ok(leadsRes, 'leads');
  const vc = ok(visitsCmp, 'visits (compare)');
  const rc = ok(revenueCmp, 'revenue (compare)');
  const lc = ok(leadsCmp, 'leads (compare)');

  costCalls += 2 + (rev?.calls ?? 0) + (rc?.calls ?? 0);

  return {
    period: {
      key: period.key,
      label: period.label,
      start: period.start,
      end: period.end,
      inProgress: period.inProgress,
    },
    revenue: {
      total: rev?.total ?? 0,
      transactions: rev?.transactions ?? 0,
      compare: rc?.total ?? null,
    },
    visits: {
      signedIn: v?.signedIn ?? 0,
      booked: v?.booked ?? 0,
      capacity: v?.capacity ?? 0,
      classes: v?.classes ?? 0,
      utilisation: v?.utilisation ?? null,
      compare: vc?.signedIn ?? null,
    },
    leads: leads ? { ...leads, compare: lc?.created ?? null } : null,
    costCalls,
    errors,
  };
}

export async function GET(request: Request) {
  // /api is outside the proxy's auth matcher, so this gates itself.
  const auth = await createClient();
  const { data: userData } = await auth.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const raw = url.searchParams.get('period') ?? 'this-week';
  const key = isPeriodKey(raw) ? raw : 'this-week';
  const pipelineId = url.searchParams.get('pipelineId') ?? undefined;

  const cacheKey = `${key}:${pipelineId ?? 'all'}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return NextResponse.json({ ...(hit.data as BusinessSummary), cached: true });
  }

  try {
    const data = await build(resolvePeriod(key), pipelineId);
    cache.set(cacheKey, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to build summary' },
      { status: 500 },
    );
  }
}
