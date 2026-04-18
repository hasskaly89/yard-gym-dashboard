import { NextResponse } from 'next/server';

const MB_BASE = 'https://api.mindbodyonline.com/public/v6';
const SITE_ID = process.env.MINDBODY_SITE_ID ?? '-99';
const API_KEY = process.env.MINDBODY_API_KEY ?? '';
const USERNAME = process.env.MINDBODY_USERNAME ?? '';
const PASSWORD = process.env.MINDBODY_PASSWORD ?? '';

// Membership IDs for each card
// Foundation T1 (11), TYG Membership (12), Foundation T2 (26), VIP (27), Black Friday Weekly (33)
const ACTIVE_MEMBERSHIP_IDS = [11, 12, 26, 27, 33];
const INTRO_MEMBERSHIP_IDS = [10];
const CLASS_PACK_MEMBERSHIP_IDS = [13];

// --- In-memory cache (survives warm Vercel instances) ---
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let cachedData: {
  counts: { active: number; intro: number; introLast7Days: number; classPacks: number; declined: number };
  updatedAt: string;
} | null = null;
let cacheTimestamp = 0;
let refreshInProgress = false;

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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token error: ${err}`);
  }

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

async function fetchCounts() {
  const token = await getStaffToken();

  // Step 1: Paginate all clients, collect those with memberships + count declined
  const memberedClientIds: string[] = [];
  let declined = 0;
  let offset = 0;

  while (true) {
    const data = await mbFetch(`/client/clients?limit=200&offset=${offset}`, token);
    const clients = data.Clients || [];

    for (const c of clients) {
      if (c.MembershipIcon > 0) memberedClientIds.push(c.Id);
      if (c.Status === 'Declined') declined++;
    }

    const total = data.PaginationResponse?.TotalResults || 0;
    offset += 200;
    if (offset >= total) break;
  }

  // Step 2: For clients with memberships, check their active membership types
  let active = 0;
  let intro = 0;
  let introLast7Days = 0;
  let classPacks = 0;
  const BATCH_SIZE = 30;

  // 7 days ago cutoff (UTC)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < memberedClientIds.length; i += BATCH_SIZE) {
    const batch = memberedClientIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(id => mbFetch(`/client/activeclientmemberships?ClientId=${id}`, token))
    );

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const memberships = result.value.ClientMemberships || [];
      const current = memberships.filter((m: { Current: boolean }) => m.Current);

      if (current.some((m: { MembershipId: number }) => ACTIVE_MEMBERSHIP_IDS.includes(m.MembershipId))) active++;

      const introMatches = current.filter((m: { MembershipId: number }) =>
        INTRO_MEMBERSHIP_IDS.includes(m.MembershipId)
      );
      if (introMatches.length > 0) {
        intro++;
        // Check if any intro membership was activated in the last 7 days
        const hasRecent = introMatches.some((m: { ActivationDate?: string; PaymentDate?: string }) => {
          const dateStr = m.ActivationDate || m.PaymentDate;
          if (!dateStr) return false;
          const ts = new Date(dateStr).getTime();
          return !isNaN(ts) && ts >= sevenDaysAgo;
        });
        if (hasRecent) introLast7Days++;
      }

      if (current.some((m: { MembershipId: number }) => CLASS_PACK_MEMBERSHIP_IDS.includes(m.MembershipId))) classPacks++;
    }
  }

  return { active, intro, introLast7Days, classPacks, declined };
}

// Background refresh — updates cache without blocking the response
function triggerBackgroundRefresh() {
  if (refreshInProgress) return;
  refreshInProgress = true;

  fetchCounts()
    .then(counts => {
      cachedData = {
        counts,
        updatedAt: new Date().toISOString(),
      };
      cacheTimestamp = Date.now();
    })
    .catch(err => console.error('Background refresh failed:', err))
    .finally(() => {
      refreshInProgress = false;
    });
}

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json({
      mock: true,
      counts: { active: 0, intro: 0, introLast7Days: 0, classPacks: 0, declined: 0 },
    });
  }

  const now = Date.now();
  const cacheAge = now - cacheTimestamp;
  const isFresh = cachedData && cacheAge < CACHE_TTL;

  // If cache is fresh, return instantly
  if (isFresh) {
    return NextResponse.json({
      mock: false,
      cached: true,
      ...cachedData,
    });
  }

  // If we have stale cache, return it immediately + refresh in background
  if (cachedData) {
    triggerBackgroundRefresh();
    return NextResponse.json({
      mock: false,
      cached: true,
      refreshing: true,
      ...cachedData,
    });
  }

  // No cache at all — first load, must wait
  try {
    const counts = await fetchCounts();
    cachedData = {
      counts,
      updatedAt: new Date().toISOString(),
    };
    cacheTimestamp = Date.now();

    return NextResponse.json({
      mock: false,
      cached: false,
      ...cachedData,
    });
  } catch (error) {
    console.error('MindBody API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch MindBody data' },
      { status: 500 }
    );
  }
}
