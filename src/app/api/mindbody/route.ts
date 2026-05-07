import { NextResponse } from 'next/server';

const MB_BASE = 'https://api.mindbodyonline.com/public/v6';
const SITE_ID = process.env.MINDBODY_SITE_ID ?? '-99';
const API_KEY = process.env.MINDBODY_API_KEY ?? '';
const USERNAME = process.env.MINDBODY_USERNAME ?? '';
const PASSWORD = process.env.MINDBODY_PASSWORD ?? '';

// Membership IDs for each card
// Active: Foundation T1 (11), TYG Membership (12), Foundation T2 (26), VIP (27), Black Friday Weekly (33)
const ACTIVE_MEMBERSHIP_IDS = [11, 12, 26, 27, 33];
const INTRO_MEMBERSHIP_IDS = [10];
const CLASS_PACK_MEMBERSHIP_IDS = [13];

// Approximate Sydney offset (ignores DST — good enough for weekly counters)
const SYDNEY_OFFSET_HOURS = 10;

// --- Cache ---
type RangedMetrics = {
  newIntros: number;
  newActive: number;
  terminations: number;
};

type Counts = {
  // Snapshots (current state)
  active: number;
  intro: number;
  classPacks: number;
  declined: number;
  attendance: { zero: number; low: number; mid: number; high: number };
  milestones: { at50: number; at100: number; at200: number; at500: number; at1000: number };
  // Per-range metrics (computed for week, month, ytd in one pass)
  ranged: {
    week: RangedMetrics;
    month: RangedMetrics;
    ytd: RangedMetrics;
  };
};

const CACHE_TTL = 5 * 60 * 1000;
let cachedData: { counts: Counts; updatedAt: string } | null = null;
let cacheTimestamp = 0;
let refreshInProgress = false;

// --- Helpers ---
function parseDateMs(d: string | null | undefined): number | null {
  if (!d) return null;
  const ts = new Date(d).getTime();
  return isNaN(ts) ? null : ts;
}

function getSydneyStarts(): { weekStartMs: number; monthStartMs: number; ytdStartMs: number } {
  // Treat UTC + 10h as Sydney wall clock to derive "Monday", "first of month", "Jan 1"
  const now = new Date();
  const sydney = new Date(now.getTime() + SYDNEY_OFFSET_HOURS * 3600 * 1000);
  const dow = sydney.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const weekStartMs =
    Date.UTC(
      sydney.getUTCFullYear(),
      sydney.getUTCMonth(),
      sydney.getUTCDate() - daysFromMonday,
    ) - SYDNEY_OFFSET_HOURS * 3600 * 1000;
  const monthStartMs =
    Date.UTC(sydney.getUTCFullYear(), sydney.getUTCMonth(), 1) -
    SYDNEY_OFFSET_HOURS * 3600 * 1000;
  const ytdStartMs =
    Date.UTC(sydney.getUTCFullYear(), 0, 1) - SYDNEY_OFFSET_HOURS * 3600 * 1000;
  return { weekStartMs, monthStartMs, ytdStartMs };
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

async function fetchCounts(): Promise<Counts> {
  const token = await getStaffToken();
  const { weekStartMs, monthStartMs, ytdStartMs } = getSydneyStarts();
  const nowMs = Date.now();
  const longAgoStr = '2000-01-01';

  const rangeStarts = {
    week: weekStartMs,
    month: monthStartMs,
    ytd: ytdStartMs,
  } as const;
  type RangeKey = keyof typeof rangeStarts;
  const RANGE_KEYS: RangeKey[] = ['week', 'month', 'ytd'];

  // --- Step 0: Build contract-template → membership-type map ---
  // Used to filter terminations to active-tier contracts only.
  const contractToMembership = new Map<number, number>();
  try {
    const locRes = await mbFetch('/site/locations', token);
    const locations = (locRes.Locations || []) as Array<{ Id: number }>;
    const locationIds = locations.length > 0 ? locations.map((l) => l.Id) : [1];

    for (const locationId of locationIds) {
      let cOffset = 0;
      while (true) {
        const data = await mbFetch(
          `/sale/contracts?LocationId=${locationId}&limit=200&offset=${cOffset}`,
          token,
        );
        const templates = (data.Contracts || []) as Array<{
          Id: number;
          AssignsMembershipId?: number;
        }>;
        for (const t of templates) {
          if (typeof t.AssignsMembershipId === 'number') {
            contractToMembership.set(t.Id, t.AssignsMembershipId);
          }
        }
        const total = data.PaginationResponse?.TotalResults ?? 0;
        cOffset += 200;
        if (cOffset >= total || templates.length === 0) break;
      }
    }
  } catch (err) {
    console.error('Failed to load contract templates:', err);
    // Continue with empty map — terminations will simply count zero
  }

  // --- Step 1: Paginate all clients, collect membered + count declined ---
  const memberedClientIds: string[] = [];
  const allClientIds: string[] = [];
  let declined = 0;
  let offset = 0;

  while (true) {
    const data = await mbFetch(`/client/clients?limit=200&offset=${offset}`, token);
    const clients = data.Clients || [];
    for (const c of clients) {
      allClientIds.push(c.Id);
      if (c.MembershipIcon > 0) memberedClientIds.push(c.Id);
      if (c.Status === 'Declined') declined++;
    }
    const total = data.PaginationResponse?.TotalResults || 0;
    offset += 200;
    if (offset >= total) break;
  }

  // --- Step 2: For each membered client, fetch memberships ---
  let active = 0;
  let intro = 0;
  let classPacks = 0;
  const ranged: Record<RangeKey, RangedMetrics> = {
    week: { newIntros: 0, newActive: 0, terminations: 0 },
    month: { newIntros: 0, newActive: 0, terminations: 0 },
    ytd: { newIntros: 0, newActive: 0, terminations: 0 },
  };
  const activeMemberIds: string[] = [];
  const BATCH_SIZE = 30;

  type ClientMembership = {
    MembershipId: number;
    Current: boolean;
    ActiveDate?: string;
    PaymentDate?: string;
    ExpirationDate?: string;
  };

  type ClientContract = {
    Id?: number;
    ContractID?: number;
    ContractName?: string;
    StartDate?: string;
    EndDate?: string;
    TerminationDate?: string | null;
  };

  for (let i = 0; i < memberedClientIds.length; i += BATCH_SIZE) {
    const batch = memberedClientIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (id) => {
        const [memRes, conRes] = await Promise.all([
          mbFetch(`/client/activeclientmemberships?ClientId=${id}`, token),
          mbFetch(`/client/clientcontracts?ClientId=${id}`, token).catch(() => ({
            Contracts: [],
          })),
        ]);
        return {
          id,
          memberships: (memRes.ClientMemberships || []) as ClientMembership[],
          contracts: (conRes.Contracts || []) as ClientContract[],
        };
      }),
    );

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const { id, memberships, contracts } = result.value;
      const current = memberships.filter((m) => m.Current);

      const activeMatches = current.filter((m) =>
        ACTIVE_MEMBERSHIP_IDS.includes(m.MembershipId),
      );
      if (activeMatches.length > 0) {
        active++;
        activeMemberIds.push(id);

        // New active member: count once per client per range it activated within
        for (const key of RANGE_KEYS) {
          const start = rangeStarts[key];
          const inRange = activeMatches.some((m) => {
            const ts = parseDateMs(m.ActiveDate || m.PaymentDate);
            return ts !== null && ts >= start;
          });
          if (inRange) ranged[key].newActive++;
        }
      }

      const introMatches = current.filter((m) =>
        INTRO_MEMBERSHIP_IDS.includes(m.MembershipId),
      );
      if (introMatches.length > 0) {
        intro++;
        for (const key of RANGE_KEYS) {
          const start = rangeStarts[key];
          const inRange = introMatches.some((m) => {
            const ts = parseDateMs(m.ActiveDate || m.PaymentDate);
            return ts !== null && ts >= start;
          });
          if (inRange) ranged[key].newIntros++;
        }
      }

      if (current.some((m) => CLASS_PACK_MEMBERSHIP_IDS.includes(m.MembershipId))) {
        classPacks++;
      }

      // Terminations: contracts with TerminationDate in the range that
      // assign an active-tier membership and have already terminated (no future-dated)
      const terminated = contracts.filter((c) => {
        if (!c.TerminationDate) return false;
        const templateId = c.ContractID;
        if (typeof templateId !== 'number') return false;
        const membershipId = contractToMembership.get(templateId);
        if (membershipId === undefined) return false;
        return ACTIVE_MEMBERSHIP_IDS.includes(membershipId);
      });
      if (terminated.length > 0) {
        for (const key of RANGE_KEYS) {
          const start = rangeStarts[key];
          const inRange = terminated.some((c) => {
            const ts = parseDateMs(c.TerminationDate);
            return ts !== null && ts >= start && ts <= nowMs;
          });
          if (inRange) ranged[key].terminations++;
        }
      }
    }
  }

  // --- Step 2b: For non-membered clients, fetch contracts to catch fully-departed terminations ---
  const memberedSet = new Set(memberedClientIds);
  const nonMemberedIds = allClientIds.filter((id) => !memberedSet.has(id));

  for (let i = 0; i < nonMemberedIds.length; i += BATCH_SIZE) {
    const batch = nonMemberedIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((id) =>
        mbFetch(`/client/clientcontracts?ClientId=${id}`, token)
          .then((r) => ({ contracts: (r.Contracts || []) as ClientContract[] }))
          .catch(() => ({ contracts: [] as ClientContract[] })),
      ),
    );

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const { contracts } = result.value;
      const terminated = contracts.filter((c) => {
        if (!c.TerminationDate) return false;
        const templateId = c.ContractID;
        if (typeof templateId !== 'number') return false;
        const membershipId = contractToMembership.get(templateId);
        if (membershipId === undefined) return false;
        return ACTIVE_MEMBERSHIP_IDS.includes(membershipId);
      });
      if (terminated.length > 0) {
        for (const key of RANGE_KEYS) {
          const start = rangeStarts[key];
          const inRange = terminated.some((c) => {
            const ts = parseDateMs(c.TerminationDate);
            return ts !== null && ts >= start && ts <= nowMs;
          });
          if (inRange) ranged[key].terminations++;
        }
      }
    }
  }

  // --- Step 3: For each active member, paginate full visit history ---
  // Filter: SignedIn === true AND class Name does NOT contain "creche" (case-insensitive)
  // From filtered list: compute 30-day and lifetime counts
  const attendance = { zero: 0, low: 0, mid: 0, high: 0 };
  const milestones = { at50: 0, at100: 0, at200: 0, at500: 0, at1000: 0 };
  const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

  type Visit = { SignedIn?: boolean; Name?: string | null; StartDateTime?: string };

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

  for (let i = 0; i < activeMemberIds.length; i += BATCH_SIZE) {
    const batch = activeMemberIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (id) => {
        const visits = await fetchAllVisits(id);
        const filtered = visits.filter((v) => {
          if (v.SignedIn !== true) return false;
          const name = (v.Name || '').toLowerCase();
          if (name.includes('creche')) return false;
          return true;
        });
        const recentCount = filtered.filter((v) => {
          const ts = parseDateMs(v.StartDateTime);
          return ts !== null && ts >= thirtyDaysAgoMs;
        }).length;
        return { recentCount, totalCount: filtered.length };
      }),
    );

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const { recentCount, totalCount } = result.value;

      // Attendance bucket (last 30 days, filtered)
      if (recentCount === 0) attendance.zero++;
      else if (recentCount <= 10) attendance.low++;
      else if (recentCount <= 20) attendance.mid++;
      else attendance.high++;

      // Class milestone buckets (lifetime, filtered, inclusive)
      if (totalCount >= 50) milestones.at50++;
      if (totalCount >= 100) milestones.at100++;
      if (totalCount >= 200) milestones.at200++;
      if (totalCount >= 500) milestones.at500++;
      if (totalCount >= 1000) milestones.at1000++;
    }
  }

  return {
    active,
    intro,
    classPacks,
    declined,
    attendance,
    milestones,
    ranged,
  };
}

// --- Background refresh ---
function triggerBackgroundRefresh() {
  if (refreshInProgress) return;
  refreshInProgress = true;

  fetchCounts()
    .then((counts) => {
      cachedData = { counts, updatedAt: new Date().toISOString() };
      cacheTimestamp = Date.now();
    })
    .catch((err) => console.error('Background refresh failed:', err))
    .finally(() => {
      refreshInProgress = false;
    });
}

// --- Empty counts (for mock / first-load placeholder) ---
function emptyCounts(): Counts {
  const emptyRanged: RangedMetrics = { newIntros: 0, newActive: 0, terminations: 0 };
  return {
    active: 0,
    intro: 0,
    classPacks: 0,
    declined: 0,
    attendance: { zero: 0, low: 0, mid: 0, high: 0 },
    milestones: { at50: 0, at100: 0, at200: 0, at500: 0, at1000: 0 },
    ranged: {
      week: { ...emptyRanged },
      month: { ...emptyRanged },
      ytd: { ...emptyRanged },
    },
  };
}

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json({ mock: true, counts: emptyCounts() });
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
    const counts = await fetchCounts();
    cachedData = { counts, updatedAt: new Date().toISOString() };
    cacheTimestamp = Date.now();
    return NextResponse.json({ mock: false, cached: false, ...cachedData });
  } catch (error) {
    console.error('MindBody API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch MindBody data' },
      { status: 500 },
    );
  }
}
