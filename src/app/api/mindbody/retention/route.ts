import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { tallyVisitWindows } from '@/lib/retention/windows';
import { computeHealthScore, type RiskBand } from '@/lib/retention/healthScore';
import { daysSinceSydney } from '@/lib/retention/dates';
import { classify, type TrendCategory } from '@/lib/retention/classify';
import { reasonFor } from '@/lib/retention/reasons';
import { scoreDeltaSince, type ScoreDelta, type Snapshot } from '@/lib/retention/scoreDelta';
import { sydneyYmd } from '@/lib/retention/dates';
import type { QueueMembership } from '@/lib/retention/queues';

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
  nextBookingAt: string | null;
  noShows30: number;
  lateCancels30: number;
  totalVisitCount: number;
  membershipStartDate: string | null;
  // Queue layer (Recovr's My Tasks)
  hasPaidMembership: boolean;
  membership: QueueMembership | null;
  scoreDelta: ScoreDelta | null;
  reason: string;
};

// MindBody calls all three of these "TYG Membership" (MembershipId 12); the
// ProductId is what tells a commitment from ongoing weekly. Mapping confirmed
// by Hassan from the typical active→expiry span of each (30 Sep).
const TYG_MEMBERSHIP_VARIANT: Record<number, string> = {
  100017: '8-Week Commitment',
  100086: '6-Month Commitment',
  100339: 'Weekly',
};

type MembershipRow = {
  mindbody_client_id: string;
  kind: 'paid' | 'intro' | 'class_pack' | 'other';
  name: string | null;
  active_date: string | null;
  expiration_date: string | null;
  remaining_sessions: number | null;
  total_sessions: number | null;
  still_returned: boolean;
  last_seen_at: string;
  raw: { ProductId?: number } | null;
};

const UNLIMITED = 9999;

// One membership per member for the card: the current paid one with the
// latest expiry; otherwise a current intro/pack; otherwise a paid one that
// ended in the last fortnight ("expired package").
function summariseMembership(rows: MembershipRow[], today: string, nowMs: number): QueueMembership | null {
  const daysTo = (d: string | null) => (d ? Math.round((Date.parse(d) - Date.parse(today)) / 86400000) : null);
  const label = (r: MembershipRow) => {
    const variant = r.raw?.ProductId ? TYG_MEMBERSHIP_VARIANT[r.raw.ProductId] : undefined;
    return variant && r.name === 'TYG Membership' ? `${r.name} · ${variant}` : (r.name ?? 'Membership');
  };
  const shape = (r: MembershipRow, justExpired: boolean): QueueMembership => ({
    name: label(r),
    kind: r.kind,
    activeDate: r.active_date,
    expirationDate: r.expiration_date,
    daysToExpiry: daysTo(r.expiration_date),
    remainingSessions: r.total_sessions !== null && r.total_sessions >= UNLIMITED ? null : r.remaining_sessions,
    totalSessions: r.total_sessions !== null && r.total_sessions >= UNLIMITED ? null : r.total_sessions,
    justExpired,
  });
  const latest = (rs: MembershipRow[]) =>
    rs.sort((a, b) => (b.expiration_date ?? '').localeCompare(a.expiration_date ?? ''))[0];

  const current = rows.filter((r) => r.still_returned);
  const paid = current.filter((r) => r.kind === 'paid');
  if (paid.length) return shape(latest(paid), false);
  const intro = current.filter((r) => r.kind === 'intro' || r.kind === 'class_pack');
  if (intro.length) return shape(latest(intro), false);
  const fortnight = nowMs - 14 * 86400000;
  const ended = rows.filter((r) => !r.still_returned && r.kind === 'paid' && Date.parse(r.last_seen_at) >= fortnight);
  if (ended.length) return shape(latest(ended), true);
  return null;
}

// Members who are not paid but hold a current intro offer or class pack — the
// Conversions queue. They are not in the nightly visit sync (paid only), so
// their windows are whatever history exists.
async function fetchConversionCandidates(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<PaidMemberRow[]> {
  const { data: rows } = await supabase
    .from('member_memberships')
    .select('mindbody_client_id')
    .in('kind', ['intro', 'class_pack'])
    .eq('still_returned', true)
    .returns<{ mindbody_client_id: string }[]>();
  const ids = [...new Set((rows ?? []).map((r) => r.mindbody_client_id))];
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from('members')
    .select(
      'mindbody_client_id, first_name, last_name, email, phone, ghl_contact_id, last_visit_date, total_visit_count, membership_start_date, next_booking_at',
    )
    .in('mindbody_client_id', ids)
    .eq('status', 'active')
    .eq('has_paid_membership', false)
    .returns<PaidMemberRow[]>();
  return data ?? [];
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
  next_booking_at: string | null;
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
      'mindbody_client_id, first_name, last_name, email, phone, ghl_contact_id, last_visit_date, total_visit_count, membership_start_date, next_booking_at',
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

  const conversionRows = await fetchConversionCandidates(supabase);
  const allRows = [...paid, ...conversionRows];
  const allIds = allRows.map((m) => m.mindbody_client_id);
  const paidSet = new Set(paid.map((m) => m.mindbody_client_id));
  const nowMs = Date.now();
  const today = sydneyYmd(new Date(nowMs));

  const [windows, summaries, membershipRows, snapshotRows] = await Promise.all([
    tallyVisitWindows(supabase, allIds),
    fetchSummaries(supabase),
    supabase
      .from('member_memberships')
      .select('mindbody_client_id, kind, name, active_date, expiration_date, remaining_sessions, total_sessions, still_returned, last_seen_at, raw')
      .in('mindbody_client_id', allIds)
      .returns<MembershipRow[]>()
      .then((r) => r.data ?? []),
    // Last 35 days of history, for "dropped N points since <date>".
    (async () => {
      const since = sydneyYmd(new Date(nowMs - 35 * 86400000));
      const out: (Snapshot & { mindbody_client_id: string })[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase
          .from('member_score_snapshots')
          .select('mindbody_client_id, snapshot_date, score, band')
          .in('mindbody_client_id', allIds)
          .gte('snapshot_date', since)
          .lt('snapshot_date', today)
          .order('snapshot_date', { ascending: true })
          .range(from, from + 999)
          .returns<(Snapshot & { mindbody_client_id: string })[]>();
        if (!data?.length) break;
        out.push(...data);
        if (data.length < 1000) break;
      }
      return out;
    })(),
  ]);

  const membershipsById = new Map<string, MembershipRow[]>();
  for (const r of membershipRows) {
    if (!membershipsById.has(r.mindbody_client_id)) membershipsById.set(r.mindbody_client_id, []);
    membershipsById.get(r.mindbody_client_id)!.push(r);
  }
  const historyById = new Map<string, Snapshot[]>();
  for (const r of snapshotRows) {
    if (!historyById.has(r.mindbody_client_id)) historyById.set(r.mindbody_client_id, []);
    historyById.get(r.mindbody_client_id)!.push(r);
  }

  const members: RetentionMember[] = allRows.map((m) => {
    const c = windows.get(m.mindbody_client_id) ?? {
      last7: 0,
      prior7: 0,
      last30: 0,
      prior30: 0,
      last56: 0,
      prior56: 0,
      noShows30: 0,
      lateCancels30: 0,
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
    const hasPaidMembership = paidSet.has(m.mindbody_client_id);
    const membership = summariseMembership(membershipsById.get(m.mindbody_client_id) ?? [], today, nowMs);
    const scoreDelta = scoreDeltaSince(historyById.get(m.mindbody_client_id) ?? [], health.score, health.band);
    const perWeekNow = Math.round((c.last56 / 8) * 10) / 10;
    const perWeekPrior = Math.round((c.prior56 / 8) * 10) / 10;
    const reason = reasonFor({
      score: health.score,
      band: health.band,
      scoreDelta,
      perWeekNow,
      perWeekPrior,
      declinePct: c.prior56 >= 4 ? Math.round(((c.prior56 - c.last56) / c.prior56) * 100) : null,
      daysSinceLastVisit: dslv,
      nextBookingAt: m.next_booking_at ?? null,
      noShows30: c.noShows30,
      membership,
      nowMs,
      fallback: health.reasons[0] ?? '',
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
      // A summary is only written for at-risk members, so one attached to a
      // member who is healthy RIGHT NOW describes a situation that has ended —
      // Adam Kicurkis' card said "hasn't been in for 63 days" five days after
      // he came back. The live band decides; the card falls back to reasons[0],
      // which is computed on this request and cannot be stale.
      aiSummary: atRisk ? (stored?.summary ?? null) : null,
      aiSummaryAt: atRisk ? (stored?.at ?? null) : null,
      nextBookingAt: m.next_booking_at ?? null,
      noShows30: c.noShows30,
      lateCancels30: c.lateCancels30,
      totalVisitCount: m.total_visit_count ?? 0,
      membershipStartDate: m.membership_start_date,
      hasPaidMembership,
      membership,
      scoreDelta,
      reason,
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
