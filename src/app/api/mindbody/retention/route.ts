import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { tallyVisitWindows } from '@/lib/retention/windows';
import { computeHealthScore, type RiskBand } from '@/lib/retention/healthScore';
import { daysSinceSydney } from '@/lib/retention/dates';

// IMPORTANT — cost note (see memory: project_mindbody_api_billing):
// MindBody bills $0.002 PER API CALL. This endpoint used to recompute the
// retention board live from MindBody on every page load (~1,500–2,000 calls
// each), which was the single biggest driver of a 203k-call / $406 month.
//
// It now reads entirely from Supabase: the nightly cron (/api/milestones/cron)
// syncs `members` + `member_visits` and persists health_score / risk_band /
// ai_summary. Computing the board from those tables costs ZERO MindBody calls.

export const dynamic = 'force-dynamic';

const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID ?? '';
const GHL_PORTAL_URL =
  process.env.GHL_PORTAL_URL ?? 'https://crm.theyardgym.com.au';

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
  last56d: number;
  prior56d: number;
  trend: number;
  ghlContactId: string | null;
  // Health layer (Recovr parity)
  healthScore: number;
  riskBand: RiskBand;
  reasons: string[];
  daysSinceLastVisit: number | null;
  aiSummary: string | null;
  totalVisitCount: number;
  membershipStartDate: string | null;
};

const SEVERITY: Record<TrendCategory, number> = {
  STABLE: 0,
  SLOWING: 1,
  SLIDING: 2,
  STOPPED: 3,
};

// Classification is a trend ratio over 8 weeks, floored by how long it has
// actually been since the member turned up.
//
// The ratio alone cannot be trusted, because both of its windows lag. A member
// who stopped a fortnight ago still carries a month of earlier visits in his
// "recent" window, so the ratio can read as healthy — or even improving — while
// he is halfway out the door. The recency floor is what stops that: a ratio may
// make the verdict worse, never better than the member's actual absence allows.
function classify(
  last56: number,
  prior56: number,
  daysSinceLastVisit: number | null,
): TrendCategory {
  if (daysSinceLastVisit === null || daysSinceLastVisit >= 30) return 'STOPPED';

  const byTrend = ((): TrendCategory => {
    if (last56 === 0) return 'STOPPED';
    if (prior56 < 4) {
      if (last56 >= 16) return 'STABLE';
      if (last56 >= 8) return 'SLOWING';
      return 'SLIDING';
    }
    const trend = last56 / prior56;
    if (trend >= 0.85) return 'STABLE';
    if (trend >= 0.55) return 'SLOWING';
    if (trend >= 0.25) return 'SLIDING';
    return 'STOPPED';
  })();

  // ...and the mirror of that floor. A ratio only carries information near the
  // bottom: someone still averaging 2+ sessions a week who trained this week is
  // not "slowing" in any sense a phone call helps, however their last 8 weeks
  // compare to a heavier 8 before it. Without this the board demotes its most
  // committed members for ordinary variation and buries the real leavers.
  if (daysSinceLastVisit <= 7 && last56 >= 16) return 'STABLE';

  // Two weeks absent is already at-risk regardless of what the ratio says.
  const floor: TrendCategory = daysSinceLastVisit >= 14 ? 'SLIDING' : 'STABLE';
  return SEVERITY[byTrend] >= SEVERITY[floor] ? byTrend : floor;
}

type PaidMemberRow = {
  mindbody_client_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  ghl_contact_id: string | null;
  last_visit_date: string | null;
  total_visit_count: number | null;
  membership_start_date: string | null;
};

// Reads persisted AI summaries. Wrapped so the board still works BEFORE the
// 007_health_scores migration adds the column (returns an empty map instead of
// erroring).
async function fetchSummaries(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { data, error } = await supabase
      .from('members')
      .select('mindbody_client_id, ai_summary')
      .not('ai_summary', 'is', null)
      .returns<{ mindbody_client_id: string; ai_summary: string | null }[]>();
    if (error || !data) return map;
    for (const r of data) if (r.ai_summary) map.set(r.mindbody_client_id, r.ai_summary);
  } catch {
    // column not present yet — fine.
  }
  return map;
}

export async function GET() {
  const supabase = createAdminClient();

  const { data: paidRows, error: paidErr } = await supabase
    .from('members')
    .select(
      'mindbody_client_id, first_name, last_name, email, phone, ghl_contact_id, last_visit_date, total_visit_count, membership_start_date',
    )
    .eq('status', 'active')
    .eq('has_paid_membership', true)
    .returns<PaidMemberRow[]>();

  if (paidErr) {
    return NextResponse.json({ error: paidErr.message }, { status: 500 });
  }

  const paid = paidRows ?? [];
  if (paid.length === 0) {
    return NextResponse.json({
      mock: false,
      members: [],
      ghlLocationId: GHL_LOCATION_ID,
      ghlPortalUrl: GHL_PORTAL_URL,
      updatedAt: new Date().toISOString(),
    });
  }

  const paidIds = paid.map((m) => m.mindbody_client_id);
  const windows = await tallyVisitWindows(supabase, paidIds);
  const summaries = await fetchSummaries(supabase);

  const members: RetentionMember[] = paid.map((m) => {
    const c = windows.get(m.mindbody_client_id) ?? {
      last7: 0,
      prior7: 0,
      last30: 0,
      prior30: 0,
      last56: 0,
      prior56: 0,
    };
    // Trend is the 8-week ratio the board classifies on, so the percentage on
    // the card and the column it sits in can never disagree.
    const trend =
      c.prior56 > 0 ? Math.min(c.last56 / c.prior56, 2) : c.last56 > 0 ? 1 : 0;
    const dslv = daysSinceSydney(m.last_visit_date);
    const health = computeHealthScore({
      last7: c.last7,
      prior7: c.prior7,
      last30: c.last30,
      prior30: c.prior30,
      last56: c.last56,
      prior56: c.prior56,
      daysSinceLastVisit: dslv,
      totalVisitCount: m.total_visit_count ?? 0,
    });
    return {
      id: m.mindbody_client_id,
      firstName: m.first_name ?? '',
      lastName: m.last_name ?? '',
      email: m.email ?? '',
      mobilePhone: m.phone ?? '',
      trendCategory: classify(c.last56, c.prior56, dslv),
      last30d: c.last30,
      prior30d: c.prior30,
      last7d: c.last7,
      prior7d: c.prior7,
      last56d: c.last56,
      prior56d: c.prior56,
      trend: Math.round(trend * 100) / 100,
      ghlContactId: m.ghl_contact_id ?? null,
      healthScore: health.score,
      riskBand: health.band,
      reasons: health.reasons,
      daysSinceLastVisit: dslv,
      aiSummary: summaries.get(m.mindbody_client_id) ?? null,
      totalVisitCount: m.total_visit_count ?? 0,
      membershipStartDate: m.membership_start_date,
    };
  });

  const { data: lastSync } = await supabase
    .from('member_visits')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    mock: false,
    cached: true,
    members,
    ghlLocationId: GHL_LOCATION_ID,
    ghlPortalUrl: GHL_PORTAL_URL,
    updatedAt: lastSync?.created_at ?? new Date().toISOString(),
  });
}
