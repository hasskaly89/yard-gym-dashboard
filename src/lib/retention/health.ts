import { createAdminClient } from '@/lib/supabase/admin';
import { tallyVisitWindows } from './windows';
import { computeHealthScore, type RiskBand } from './healthScore';
import { daysSinceSydney } from './dates';
import { classify, type TrendCategory } from './classify';

// Orchestrates the health-score engine over the paid-member audience. Split so
// the read+score step is side-effect-free (used for the dry-run preview) and
// persistence is separate (used by the nightly cron). All reads are from
// Supabase — ZERO MindBody calls.

export type ScoredMember = {
  id: string;
  firstName: string;
  lastName: string;
  score: number;
  band: RiskBand;
  reasons: string[];
  daysSinceLastVisit: number | null;
  last30: number;
  prior30: number;
  last56: number;
  prior56: number;
  last7: number;
  prior7: number;
  trendCategory: TrendCategory;
  // What was stored BEFORE this run — the summariser regenerates only when
  // something moved, and these are how it knows.
  prevScore: number | null;
  prevBand: RiskBand | null;
  aiSummaryAt: string | null;
};

type PaidRow = {
  mindbody_client_id: string;
  first_name: string | null;
  last_name: string | null;
  last_visit_date: string | null;
  total_visit_count: number | null;
  health_score: number | null;
  risk_band: RiskBand | null;
  ai_summary_at: string | null;
};

// Read-only: computes a health score for every paid, active member.
export async function computeScoresForPaidMembers(
  supabase = createAdminClient(),
): Promise<ScoredMember[]> {
  const { data: paid, error } = await supabase
    .from('members')
    .select(
      'mindbody_client_id, first_name, last_name, last_visit_date, total_visit_count, health_score, risk_band, ai_summary_at',
    )
    .eq('status', 'active')
    .eq('has_paid_membership', true)
    .returns<PaidRow[]>();

  if (error) throw new Error(`computeScores: ${error.message}`);
  const rows = paid ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.mindbody_client_id);
  const windows = await tallyVisitWindows(supabase, ids);

  return rows.map((r) => {
    const w = windows.get(r.mindbody_client_id) ?? {
      last7: 0,
      prior7: 0,
      last30: 0,
      prior30: 0,
      last56: 0,
      prior56: 0,
    };
    const dslv = daysSinceSydney(r.last_visit_date);
    const { score, band, reasons } = computeHealthScore({
      last7: w.last7,
      prior7: w.prior7,
      last30: w.last30,
      prior30: w.prior30,
      last56: w.last56,
      prior56: w.prior56,
      daysSinceLastVisit: dslv,
      totalVisitCount: r.total_visit_count ?? 0,
    });
    return {
      id: r.mindbody_client_id,
      firstName: r.first_name ?? '',
      lastName: r.last_name ?? '',
      score,
      band,
      reasons,
      daysSinceLastVisit: dslv,
      last30: w.last30,
      prior30: w.prior30,
      last56: w.last56,
      prior56: w.prior56,
      last7: w.last7,
      prior7: w.prior7,
      trendCategory: classify(w.last56, w.prior56, dslv),
      prevScore: r.health_score,
      prevBand: r.risk_band,
      aiSummaryAt: r.ai_summary_at,
    };
  });
}

// Persists scores to members.health_score / risk_band / score_updated_at.
// Requires migration 007_health_scores.sql.
export async function persistHealthScores(
  scored: ScoredMember[],
  supabase = createAdminClient(),
): Promise<{ updated: number; errors: string[] }> {
  const now = new Date().toISOString();
  const errors: string[] = [];
  let updated = 0;
  const BATCH = 50;

  for (let i = 0; i < scored.length; i += BATCH) {
    const batch = scored.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (m) => {
        const { error } = await supabase
          .from('members')
          .update({
            health_score: m.score,
            risk_band: m.band,
            score_updated_at: now,
          })
          .eq('mindbody_client_id', m.id);
        if (error) throw new Error(`${m.id}: ${error.message}`);
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') updated++;
      else errors.push(String(r.reason));
    }
  }
  return { updated, errors };
}

// Scores and summaries are only ever WRITTEN for paid, at-risk members, so
// without this they outlive the situation they describe. Two leaks:
//   - a member who drops off has_paid_membership keeps a health_score forever
//     (74 such rows on 2026-09-13) — a trap for any query that reads the
//     column without also filtering on paid;
//   - a member who recovers to healthy keeps their at-risk blurb, because the
//     summariser skips healthy members and so never overwrites it.
// Runs every night, so both self-heal.
export async function clearStaleScores(
  scored: ScoredMember[],
  supabase = createAdminClient(),
): Promise<{ ghostScoresCleared: number; summariesCleared: number; errors: string[] }> {
  const errors: string[] = [];

  const { data: ghosts, error: gErr } = await supabase
    .from('members')
    .update({
      health_score: null,
      risk_band: null,
      score_updated_at: null,
      ai_summary: null,
      ai_summary_at: null,
    })
    .not('health_score', 'is', null)
    .or('status.neq.active,has_paid_membership.eq.false')
    .select('mindbody_client_id');
  if (gErr) errors.push(`clear ghost scores: ${gErr.message}`);

  const recovered = scored
    .filter((m) => (m.band === 'healthy' || m.band === 'lost') && m.aiSummaryAt !== null)
    .map((m) => m.id);
  let summariesCleared = 0;
  for (let i = 0; i < recovered.length; i += 100) {
    const { data, error } = await supabase
      .from('members')
      .update({ ai_summary: null, ai_summary_at: null })
      .in('mindbody_client_id', recovered.slice(i, i + 100))
      .select('mindbody_client_id');
    if (error) errors.push(`clear recovered summaries: ${error.message}`);
    summariesCleared += data?.length ?? 0;
  }

  return { ghostScoresCleared: ghosts?.length ?? 0, summariesCleared, errors };
}

export async function computeAndStoreHealthScores(): Promise<{
  scored: number;
  high: number;
  medium: number;
  healthy: number;
  lost: number;
  updated: number;
  errors: string[];
  durationMs: number;
}> {
  const started = Date.now();
  const supabase = createAdminClient();
  const scored = await computeScoresForPaidMembers(supabase);
  const { updated, errors } = await persistHealthScores(scored, supabase);
  const tally = (b: RiskBand) => scored.filter((s) => s.band === b).length;
  return {
    scored: scored.length,
    high: tally('high'),
    medium: tally('medium'),
    healthy: tally('healthy'),
    lost: tally('lost'),
    updated,
    errors,
    durationMs: Date.now() - started,
  };
}
