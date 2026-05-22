import { NextResponse } from 'next/server';

const MB_BASE = 'https://api.mindbodyonline.com/public/v6';
const SITE_ID = process.env.MINDBODY_SITE_ID ?? '-99';
const API_KEY = process.env.MINDBODY_API_KEY ?? '';
const USERNAME = process.env.MINDBODY_USERNAME ?? '';
const PASSWORD = process.env.MINDBODY_PASSWORD ?? '';

// Active: Foundation T1 (11), TYG Membership (12), Foundation T2 (26), VIP (27), Black Friday Weekly (33)
const ACTIVE_MEMBERSHIP_IDS = [11, 12, 26, 27, 33];

// GHL location id — shipped to the client so the Retention page can build
// "open contact in GHL" links per member. Not sensitive; it's in the URL.
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID ?? '';

type TrendCategory = 'STABLE' | 'SLOWING' | 'SLIDING' | 'STOPPED';

type RetentionMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobilePhone: string;
  trendCategory: TrendCategory;
  last30d: number;
  prior30d: number;
  last7d: number;
  prior7d: number;
  // last 30d / prior 30d, capped at 2.0 (200% growth). 1.0 = same as last month.
  trend: number;
};

// --- Cache ---
const CACHE_TTL = 5 * 60 * 1000;
let cachedData: { members: RetentionMember[]; updatedAt: string } | null = null;
let cacheTimestamp = 0;
let refreshInProgress = false;

// --- Helpers ---
function parseDateMs(d: string | null | undefined): number | null {
  if (!d) return null;
  const ts = new Date(d).getTime();
  return isNaN(ts) ? null : ts;
}

async function getStaffToken(): Promise<string> {
  const res = await fetch(`${MB_BASE}/usertoken/issue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'API-Key': API_KEY,
      'SiteId': SITE_ID,
    },
    body: JSON.stringify({ Username: USERNAME, Password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Token error: ${await res.text()}`);
  const data = await res.json();
  return data.AccessToken;
}

async function mbFetch(path: string, token: string) {
  const res = await fetch(`${MB_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'API-Key': API_KEY,
      'SiteId': SITE_ID,
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`MindBody API error on ${path}: ${res.status}`);
  return res.json();
}

type RawClient = {
  Id: string;
  FirstName?: string;
  LastName?: string;
  Email?: string;
  MobilePhone?: string;
  MembershipIcon?: number;
};

type ClientMembership = {
  MembershipId: number;
  Current: boolean;
};

type Visit = {
  SignedIn?: boolean;
  Name?: string | null;
  StartDateTime?: string;
};

// Trend-based classification. Compares last 30d to prior 30d (days 30-60 ago)
// so the signal is *change*, not absolute volume — that's how we catch the
// 6-12 week slide before someone becomes a zero-visit non-attender.
function classify(last30: number, prior30: number): TrendCategory {
  if (last30 === 0) return 'STOPPED';

  // Brand-new member with no prior-month baseline — judge on absolute attendance.
  // ~2 visits/wk is roughly the floor for "engaged."
  if (prior30 < 2) {
    if (last30 >= 8) return 'STABLE';
    if (last30 >= 4) return 'SLOWING';
    return 'SLIDING';
  }

  const trend = last30 / prior30;
  if (trend >= 0.85) return 'STABLE';
  if (trend >= 0.55) return 'SLOWING';
  if (trend >= 0.25) return 'SLIDING';
  return 'STOPPED';
}

async function fetchRetention(): Promise<RetentionMember[]> {
  const token = await getStaffToken();
  const nowMs = Date.now();
  const last7Start = nowMs - 7 * 86400000;
  const last14Start = nowMs - 14 * 86400000;
  const last30Start = nowMs - 30 * 86400000;
  const last60Start = nowMs - 60 * 86400000;

  // Fetch only ~75 days of visits per member — enough headroom for prior-30d
  // comparison plus a few days of buffer. Much faster than scanning lifetime.
  const visitWindowStartStr = new Date(nowMs - 75 * 86400000)
    .toISOString()
    .split('T')[0];

  // Step 1: paginate all clients, keep those with a membership icon
  const memberedClients: RawClient[] = [];
  let offset = 0;
  while (true) {
    const data = await mbFetch(`/client/clients?limit=200&offset=${offset}`, token);
    const clients: RawClient[] = data.Clients || [];
    for (const c of clients) {
      if ((c.MembershipIcon ?? 0) > 0) memberedClients.push(c);
    }
    const total = data.PaginationResponse?.TotalResults || 0;
    offset += 200;
    if (offset >= total) break;
  }

  // Step 2: filter to clients on an active-tier membership
  const BATCH_SIZE = 30;
  const activeClients: RawClient[] = [];

  for (let i = 0; i < memberedClients.length; i += BATCH_SIZE) {
    const batch = memberedClients.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (c) => {
        const memRes = await mbFetch(
          `/client/activeclientmemberships?ClientId=${c.Id}`,
          token,
        );
        const memberships: ClientMembership[] = memRes.ClientMemberships || [];
        const hasActive = memberships.some(
          (m) => m.Current && ACTIVE_MEMBERSHIP_IDS.includes(m.MembershipId),
        );
        return { client: c, hasActive };
      }),
    );

    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      if (r.value.hasActive) activeClients.push(r.value.client);
    }
  }

  // Step 3: for each active member, pull last 75d of visits and compute trend
  async function fetchVisits(clientId: string): Promise<Visit[]> {
    const visits: Visit[] = [];
    let vOffset = 0;
    const PAGE = 200;
    while (true) {
      const data = await mbFetch(
        `/client/clientvisits?ClientId=${clientId}&StartDate=${visitWindowStartStr}&limit=${PAGE}&offset=${vOffset}`,
        token,
      );
      const page: Visit[] = data.Visits || [];
      visits.push(...page);
      const total = data.PaginationResponse?.TotalResults ?? 0;
      vOffset += PAGE;
      if (vOffset >= total || page.length === 0) break;
    }
    return visits;
  }

  const members: RetentionMember[] = [];

  for (let i = 0; i < activeClients.length; i += BATCH_SIZE) {
    const batch = activeClients.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (client) => {
        const visits = await fetchVisits(client.Id);
        const filtered = visits.filter((v) => {
          if (v.SignedIn !== true) return false;
          const name = (v.Name || '').toLowerCase();
          if (name.includes('creche')) return false;
          return true;
        });

        let last7 = 0;
        let prior7 = 0;
        let last30 = 0;
        let prior30 = 0;
        for (const v of filtered) {
          const ts = parseDateMs(v.StartDateTime);
          if (ts === null) continue;
          if (ts >= last7Start) last7++;
          else if (ts >= last14Start) prior7++;
          if (ts >= last30Start) last30++;
          else if (ts >= last60Start) prior30++;
        }

        const trendCategory = classify(last30, prior30);
        const trend =
          prior30 > 0
            ? Math.min(last30 / prior30, 2)
            : last30 > 0
              ? 1
              : 0;

        const member: RetentionMember = {
          id: client.Id,
          firstName: client.FirstName ?? '',
          lastName: client.LastName ?? '',
          email: client.Email ?? '',
          mobilePhone: client.MobilePhone ?? '',
          trendCategory,
          last30d: last30,
          prior30d: prior30,
          last7d: last7,
          prior7d: prior7,
          trend: Math.round(trend * 100) / 100,
        };
        return member;
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') members.push(r.value);
    }
  }

  return members;
}

function triggerBackgroundRefresh() {
  if (refreshInProgress) return;
  refreshInProgress = true;

  fetchRetention()
    .then((members) => {
      cachedData = { members, updatedAt: new Date().toISOString() };
      cacheTimestamp = Date.now();
    })
    .catch((err) => console.error('Retention background refresh failed:', err))
    .finally(() => {
      refreshInProgress = false;
    });
}

export async function GET(request: Request) {
  if (!API_KEY) {
    return NextResponse.json({ mock: true, members: [], ghlLocationId: GHL_LOCATION_ID });
  }

  const url = new URL(request.url);
  if (url.searchParams.get('refresh') === 'true') {
    cachedData = null;
    cacheTimestamp = 0;
  }

  const now = Date.now();
  const cacheAge = now - cacheTimestamp;
  const isFresh = cachedData && cacheAge < CACHE_TTL;

  if (isFresh) {
    return NextResponse.json({
      mock: false,
      cached: true,
      ghlLocationId: GHL_LOCATION_ID,
      ...cachedData,
    });
  }

  // Stale cache: serve immediately, refresh in background
  if (cachedData) {
    triggerBackgroundRefresh();
    return NextResponse.json({
      mock: false,
      cached: true,
      refreshing: true,
      ghlLocationId: GHL_LOCATION_ID,
      ...cachedData,
    });
  }

  // No cache: must wait for first fetch
  try {
    const members = await fetchRetention();
    cachedData = { members, updatedAt: new Date().toISOString() };
    cacheTimestamp = Date.now();
    return NextResponse.json({
      mock: false,
      cached: false,
      ghlLocationId: GHL_LOCATION_ID,
      ...cachedData,
    });
  } catch (error) {
    console.error('Retention API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch retention data' },
      { status: 500 },
    );
  }
}
