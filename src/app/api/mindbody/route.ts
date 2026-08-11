import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { tallyVisitWindows } from '@/lib/retention/windows';

// COST — MindBody bills $0.002/call. This endpoint USED TO recompute every
// dashboard number live from MindBody on each load: ~3,000 calls (~$6) per
// refresh (per-member memberships + contracts + full visit history), with an
// in-memory cache that Vercel serverless cold-starts wiped — a major cost leak.
//
// It now reads ENTIRELY from Supabase (members + member_visits), synced nightly
// by /api/milestones/cron. ZERO MindBody calls per load.
//
// NOTE: metrics that depend on data not yet mirrored into Supabase — intro /
// class-pack tiers, declined / suspended status, and the ranged new/terminated
// counters — return 0 for now. They'll be restored cheaply by enriching the
// nightly sync (no extra per-load cost). Active count, attendance buckets and
// class milestones are computed accurately from synced data.

export const dynamic = 'force-dynamic';

type RangedMetrics = { newIntros: number; newActive: number; terminations: number };

type Counts = {
  active: number;
  intro: number;
  classPacks: number;
  declined: number;
  suspended: number;
  attendance: { zero: number; low: number; mid: number; high: number };
  milestones: { at50: number; at100: number; at200: number; at500: number; at1000: number };
  ranged: { week: RangedMetrics; month: RangedMetrics; ytd: RangedMetrics };
};

function emptyRanged(): RangedMetrics {
  return { newIntros: 0, newActive: 0, terminations: 0 };
}

type PaidRow = { mindbody_client_id: string; total_visit_count: number | null };

async function computeCountsFromSupabase(): Promise<{ counts: Counts; updatedAt: string }> {
  const supabase = createAdminClient();

  // Active paid members = current members on an active-tier membership
  // (has_paid_membership already encodes ACTIVE_MEMBERSHIP_IDS).
  const { data: paid, error } = await supabase
    .from('members')
    .select('mindbody_client_id, total_visit_count')
    .eq('status', 'active')
    .eq('has_paid_membership', true)
    .returns<PaidRow[]>();

  if (error) throw new Error(error.message);
  const rows = paid ?? [];

  const milestones = { at50: 0, at100: 0, at200: 0, at500: 0, at1000: 0 };
  for (const r of rows) {
    const v = r.total_visit_count ?? 0;
    if (v >= 50) milestones.at50++;
    if (v >= 100) milestones.at100++;
    if (v >= 200) milestones.at200++;
    if (v >= 500) milestones.at500++;
    if (v >= 1000) milestones.at1000++;
  }

  // Attendance buckets from last-30d signed-in visits (member_visits stores
  // only signed-in, non-crèche visits, matching the old filter).
  const ids = rows.map((r) => r.mindbody_client_id);
  const windows = await tallyVisitWindows(supabase, ids);
  const attendance = { zero: 0, low: 0, mid: 0, high: 0 };
  for (const id of ids) {
    const last30 = windows.get(id)?.last30 ?? 0;
    if (last30 === 0) attendance.zero++;
    else if (last30 <= 10) attendance.low++;
    else if (last30 <= 20) attendance.mid++;
    else attendance.high++;
  }

  const { data: lastSync } = await supabase
    .from('member_visits')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const counts: Counts = {
    active: rows.length,
    intro: 0,
    classPacks: 0,
    declined: 0,
    suspended: 0,
    attendance,
    milestones,
    ranged: { week: emptyRanged(), month: emptyRanged(), ytd: emptyRanged() },
  };

  return { counts, updatedAt: lastSync?.created_at ?? new Date().toISOString() };
}

export async function GET() {
  try {
    const { counts, updatedAt } = await computeCountsFromSupabase();
    return NextResponse.json({ mock: false, cached: true, source: 'supabase', counts, updatedAt });
  } catch (error) {
    console.error('MindBody counts (Supabase) error:', error);
    return NextResponse.json({ error: 'Failed to load MindBody counts' }, { status: 500 });
  }
}
