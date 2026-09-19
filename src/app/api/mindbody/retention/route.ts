import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { tallyVisitWindows } from '@/lib/retention/windows';
import { computeHealthScore, type RiskBand } from '@/lib/retention/healthScore';
import { daysSinceSydney } from '@/lib/retention/dates';
import { classify, type TrendCategory } from '@/lib/retention/classify';

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
  aiSummaryAt: string | null;
  totalVisitCount: number;
  membershipStartDate: string | null;
};

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

// Reads persisted AI summaries with the time each was written. Wrapped so the
// board still works before the 007_health_scores migration (empty map instead
// of an error).
type StoredSummary = { summary: string; at: string | null };

async function fetchSummaries(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<Map<string, StoredSummary>> {
  const map = new Map<string, StoredSummary>();
  try {
    const { data, error } = await supabase
      .from('members')
      .select('mindbody_client_id, ai_summary, ai_summary_at')
      .not('ai_summary', 'is', null)
      .returns<
        { mindbody_client_id: string; ai_summary: string | null; ai_summary_at: string | null }[]
      >();
    if (error || !data) return map;
    for (const r of data) {
      if (r.ai_summary) map.set(r.mindbody_client_id, { summary: r.ai_summary, at: r.ai_summary_at });
    }
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
    const atRisk = health.band === 'high' || health.band === 'medium';
    const stored = summaries.get(m.mindbody_client_id);
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
      // A summary is only written for at-risk members, so one attached to a
      // member who is healthy RIGHT NOW describes a situation that has ended —
      // Adam Kicurkis' card said "hasn't been in for 63 days" five days after
      // he came back. The live band decides; the card falls back to reasons[0],
      // which is computed on this request and cannot be stale.
      aiSummary: atRisk ? (stored?.summary ?? null) : null,
      aiSummaryAt: atRisk ? (stored?.at ?? null) : null,
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
