import { NextResponse } from 'next/server';

const MB_BASE = 'https://api.mindbodyonline.com/public/v6';
const SITE_ID = process.env.MINDBODY_SITE_ID ?? '-99';
const API_KEY = process.env.MINDBODY_API_KEY ?? '';
const USERNAME = process.env.MINDBODY_USERNAME ?? '';
const PASSWORD = process.env.MINDBODY_PASSWORD ?? '';

// Active: Foundation T1 (11), TYG Membership (12), Foundation T2 (26), VIP (27), Black Friday Weekly (33)
const ACTIVE_MEMBERSHIP_IDS = [11, 12, 26, 27, 33];

type RiskCategory = 'LOW_RISK' | 'MEDIUM_RISK' | 'HIGH_RISK' | 'NON_ATTENDER';

type RetentionMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobilePhone: string;
  riskCategory: RiskCategory;
  recentCount: number;
  visits60d: number;
  visits90d: number;
  expectedVisits: number;
  ratio: number;
  activeDate: string;
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
  ActiveDate?: string;
  PaymentDate?: string;
};

type Visit = {
  SignedIn?: boolean;
  Name?: string | null;
  StartDateTime?: string;
};

function classify(
  ratio: number,
  recentCount: number,
  tenureDays: number,
): RiskCategory {
  if (recentCount === 0 && tenureDays > 14) return 'NON_ATTENDER';
  if (ratio >= 0.75) return 'LOW_RISK';
  if (ratio >= 0.4) return 'MEDIUM_RISK';
  if (ratio >= 0.1) return 'HIGH_RISK';
  return 'NON_ATTENDER';
}

async function fetchRetention(): Promise<RetentionMember[]> {
  const token = await getStaffToken();
  const nowMs = Date.now();
  const longAgoStr = '2000-01-01';
  const thirtyDaysAgoMs = nowMs - 30 * 24 * 60 * 60 * 1000;
  const sixtyDaysAgoMs = nowMs - 60 * 24 * 60 * 60 * 1000;
  const ninetyDaysAgoMs = nowMs - 90 * 24 * 60 * 60 * 1000;

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

  // Step 2: filter to active-tier members; capture ActiveDate from the matching membership
  const BATCH_SIZE = 30;
  const activeMembers: Array<{ client: RawClient; activeDate: string }> = [];

  for (let i = 0; i < memberedClients.length; i += BATCH_SIZE) {
    const batch = memberedClients.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (c) => {
        const memRes = await mbFetch(
          `/client/activeclientmemberships?ClientId=${c.Id}`,
          token,
        );
        const memberships: ClientMembership[] = memRes.ClientMemberships || [];
        const activeMatch = memberships.find(
          (m) => m.Current && ACTIVE_MEMBERSHIP_IDS.includes(m.MembershipId),
        );
        return { client: c, activeMatch };
      }),
    );

    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { client, activeMatch } = r.value;
      if (!activeMatch) continue;
      const activeDate = activeMatch.ActiveDate || activeMatch.PaymentDate || '';
      activeMembers.push({ client, activeDate });
    }
  }

  // Step 3: For each active member, pull all visits and compute retention metrics
  async function fetchAllVisits(clientId: string): Promise<Visit[]> {
    const visits: Visit[] = [];
    let vOffset = 0;
    const PAGE = 200;
    while (true) {
      const data = await mbFetch(
        `/client/clientvisits?ClientId=${clientId}&StartDate=${longAgoStr}&limit=${PAGE}&offset=${vOffset}`,
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

  for (let i = 0; i < activeMembers.length; i += BATCH_SIZE) {
    const batch = activeMembers.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async ({ client, activeDate }) => {
        const visits = await fetchAllVisits(client.Id);
        const filtered = visits.filter((v) => {
          if (v.SignedIn !== true) return false;
          const name = (v.Name || '').toLowerCase();
          if (name.includes('creche')) return false;
          return true;
        });

        let recentCount = 0;
        let visits60d = 0;
        let visits90d = 0;
        for (const v of filtered) {
          const ts = parseDateMs(v.StartDateTime);
          if (ts === null) continue;
          if (ts >= thirtyDaysAgoMs) recentCount++;
          if (ts >= sixtyDaysAgoMs) visits60d++;
          if (ts >= ninetyDaysAgoMs) visits90d++;
        }
        const totalCount = filtered.length;

        const activeMs = parseDateMs(activeDate) ?? nowMs;
        const tenureDays = Math.max(1, (nowMs - activeMs) / 86400000);
        const tenureWeeks = tenureDays / 7;
        const weeklyAvg = tenureWeeks > 0 ? totalCount / tenureWeeks : 0;
        // Scope the expected-visits window to actual tenure so members who joined
        // less than 30 days ago aren't unfairly penalised against a full 30-day expectation.
        const expectedWindowDays = Math.min(tenureDays, 30);
        const expectedVisits = weeklyAvg * (expectedWindowDays / 7);
        const ratio =
          expectedVisits > 0
            ? Math.min(Math.max(recentCount / expectedVisits, 0), 1)
            : 0;
        const riskCategory = classify(ratio, recentCount, tenureDays);

        const member: RetentionMember = {
          id: client.Id,
          firstName: client.FirstName ?? '',
          lastName: client.LastName ?? '',
          email: client.Email ?? '',
          mobilePhone: client.MobilePhone ?? '',
          riskCategory,
          recentCount,
          visits60d,
          visits90d,
          expectedVisits: Math.round(expectedVisits * 10) / 10,
          ratio: Math.round(ratio * 100) / 100,
          activeDate,
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
    return NextResponse.json({ mock: true, members: [] });
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
    return NextResponse.json({ mock: false, cached: true, ...cachedData });
  }

  // Stale cache: serve immediately, refresh in background
  if (cachedData) {
    triggerBackgroundRefresh();
    return NextResponse.json({
      mock: false,
      cached: true,
      refreshing: true,
      ...cachedData,
    });
  }

  // No cache: must wait for first fetch
  try {
    const members = await fetchRetention();
    cachedData = { members, updatedAt: new Date().toISOString() };
    cacheTimestamp = Date.now();
    return NextResponse.json({ mock: false, cached: false, ...cachedData });
  } catch (error) {
    console.error('Retention API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch retention data' },
      { status: 500 },
    );
  }
}
