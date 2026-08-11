import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { tallyVisitWindows } from '@/lib/retention/windows';
import { computeHealthScore, type RiskBand } from '@/lib/retention/healthScore';

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
  trend: number;
  ghlContactId: string | null;
  // Health layer (Recovr parity)
  healthScore: number;
  riskBand: RiskBand;
  reasons: string[];
  daysSinceLastVisit: number | null;
  aiSummary: string | null;
};

// Trend-based classification — unchanged thresholds so the board looks the same.
function classify(last30: number, prior30: number): TrendCategory {
  if (last30 === 0) return 'STOPPED';
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

type PaidMemberRow = {
  mindbody_client_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  ghl_contact_id: string | null;
  last_visit_date: string | null;
  total_visit_count: number | null;
};

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

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
      'mindbody_client_id, first_name, last_name, email, phone, ghl_contact_id, last_visit_date, total_visit_count',
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
    };
    const trend =
      c.prior30 > 0 ? Math.min(c.last30 / c.prior30, 2) : c.last30 > 0 ? 1 : 0;
    const dslv = daysSince(m.last_visit_date);
    const health = computeHealthScore({
      last7: c.last7,
      prior7: c.prior7,
      last30: c.last30,
      prior30: c.prior30,
      daysSinceLastVisit: dslv,
      totalVisitCount: m.total_visit_count ?? 0,
    });
    return {
      id: m.mindbody_client_id,
      firstName: m.first_name ?? '',
      lastName: m.last_name ?? '',
      email: m.email ?? '',
      mobilePhone: m.phone ?? '',
      trendCategory: classify(c.last30, c.prior30),
      last30d: c.last30,
      prior30d: c.prior30,
      last7d: c.last7,
      prior7d: c.prior7,
      trend: Math.round(trend * 100) / 100,
      ghlContactId: m.ghl_contact_id ?? null,
      healthScore: health.score,
      riskBand: health.band,
      reasons: health.reasons,
      daysSinceLastVisit: dslv,
      aiSummary: summaries.get(m.mindbody_client_id) ?? null,
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
