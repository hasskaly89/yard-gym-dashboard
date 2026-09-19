import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeHealthScore } from './healthScore';
import { classify } from './classify';
import { tallyWindowsAsOf } from './windows';
import { sydneyYmd } from './dates';
import type { ScoredMember } from './health';

// Daily score history — one row per paid member per Sydney calendar day.
//
// Until this existed the system only knew each member's score RIGHT NOW, so it
// could never say "dropped 17 points since 31 August", never draw a line, and
// never notice that migration 014 moved 220 members' scores overnight. History
// cannot be reconstructed from scores that were overwritten, which is why this
// writes every night from the first night it ships. (It CAN be reconstructed
// from visits, because the score is a pure function of them — see backfill.)

type SnapshotRow = {
  mindbody_client_id: string;
  snapshot_date: string;
  score: number;
  band: string;
  trend_category: string;
  last7: number;
  prior7: number;
  last30: number;
  prior30: number;
  last56: number;
  prior56: number;
  days_since_last_visit: number | null;
};

async function upsertSnapshots(
  supabase: SupabaseClient,
  rows: SnapshotRow[],
): Promise<{ written: number; errors: string[] }> {
  const errors: string[] = [];
  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    // DO UPDATE, not DO NOTHING: a manual re-run later the same day should
    // replace the morning's row, not be silently ignored.
    const { error } = await supabase
      .from('member_score_snapshots')
      .upsert(chunk, { onConflict: 'mindbody_client_id,snapshot_date' });
    if (error) errors.push(`snapshots: ${error.message}`);
    else written += chunk.length;
  }
  return { written, errors };
}

// Tonight's row for every scored member.
export async function writeDailySnapshots(
  scored: ScoredMember[],
  supabase: SupabaseClient = createAdminClient(),
): Promise<{ written: number; errors: string[] }> {
  const today = sydneyYmd();
  return upsertSnapshots(
    supabase,
    scored.map((m) => ({
      mindbody_client_id: m.id,
      snapshot_date: today,
      score: m.score,
      band: m.band,
      trend_category: m.trendCategory,
      last7: m.last7,
      prior7: m.prior7,
      last30: m.last30,
      prior30: m.prior30,
      last56: m.last56,
      prior56: m.prior56,
      days_since_last_visit: m.daysSinceLastVisit,
    })),
  );
}

const DAY = 86400000;

// Replays the scoring engine as of each of the last `days` Sydney mornings for
// the CURRENT paid members, from one read of member_visits. Zero MindBody
// calls. Honest limits: it uses today's membership list (someone who joined the
// paid base last week gets history from before they were paid), and it scores
// with today's formula — which is the point: a consistent series.
export async function backfillSnapshots(
  days: number,
  supabase: SupabaseClient = createAdminClient(),
): Promise<{ members: number; dates: number; written: number; errors: string[] }> {
  const { data: paid, error } = await supabase
    .from('members')
    .select('mindbody_client_id, total_visit_count')
    .eq('status', 'active')
    .eq('has_paid_membership', true)
    .returns<{ mindbody_client_id: string; total_visit_count: number | null }[]>();
  if (error) throw new Error(`backfill: ${error.message}`);
  const members = paid ?? [];
  if (members.length === 0) return { members: 0, dates: 0, written: 0, errors: [] };

  const ids = members.map((m) => m.mindbody_client_id);
  // Oldest instant any window can reach: `days` back, plus the 112-day lookback,
  // plus slack so days-since-last-visit resolves for long-absent members.
  const sinceIso = new Date(Date.now() - (days + 112 + 120) * DAY).toISOString();

  const visits = new Map<string, number[]>();
  for (const id of ids) visits.set(id, []);
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: rows, error: vErr } = await supabase
      .from('member_visits')
      .select('mindbody_client_id, visit_at')
      .in('mindbody_client_id', ids)
      .gte('visit_at', sinceIso)
      .order('visit_at', { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<{ mindbody_client_id: string; visit_at: string }[]>();
    if (vErr) throw new Error(`backfill visits: ${vErr.message}`);
    if (!rows || rows.length === 0) break;
    for (const r of rows) visits.get(r.mindbody_client_id)?.push(new Date(r.visit_at).getTime());
    if (rows.length < PAGE) break;
  }

  const out: SnapshotRow[] = [];
  const today = sydneyYmd();
  for (let d = 1; d <= days; d++) {
    // 21:53 UTC is when the nightly run actually fires; replaying at the same
    // hour keeps backfilled rows comparable with the live ones that follow.
    const asOf = new Date(Date.now() - d * DAY);
    asOf.setUTCHours(21, 53, 0, 0);
    const asOfMs = asOf.getTime();
    const date = sydneyYmd(asOf);
    if (date >= today) continue; // never overwrite a live row with a replay

    for (const m of members) {
      const ts = visits.get(m.mindbody_client_id) ?? [];
      const w = tallyWindowsAsOf(ts, asOfMs);
      let last = 0;
      for (const t of ts) if (t <= asOfMs && t > last) last = t;
      const dslv =
        last === 0
          ? null
          : Math.max(
              0,
              Math.round(
                (Date.parse(`${date}T00:00:00Z`) -
                  Date.parse(`${sydneyYmd(new Date(last))}T00:00:00Z`)) /
                  DAY,
              ),
            );
      const h = computeHealthScore({
        ...w,
        daysSinceLastVisit: dslv,
        totalVisitCount: m.total_visit_count ?? 0,
      });
      out.push({
        mindbody_client_id: m.mindbody_client_id,
        snapshot_date: date,
        score: h.score,
        band: h.band,
        trend_category: classify(w.last56, w.prior56, dslv),
        ...w,
        days_since_last_visit: dslv,
      });
    }
  }

  const { written, errors } = await upsertSnapshots(supabase, out);
  return { members: members.length, dates: new Set(out.map((r) => r.snapshot_date)).size, written, errors };
}
