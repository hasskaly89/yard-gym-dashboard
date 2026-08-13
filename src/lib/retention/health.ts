import { createAdminClient } from '@/lib/supabase/admin';
import { tallyVisitWindows } from './windows';
import { computeHealthScore, type RiskBand } from './healthScore';
import { daysSinceSydney } from './dates';

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
};

type PaidRow = {
  mindbody_client_id: string;
  first_name: string | null;
  last_name: string | null;
  last_visit_date: string | null;
  total_visit_count: number | null;
};

// Read-only: computes a health score for every paid, active member.
export async function computeScoresForPaidMembers(
  supabase = createAdminClient(),
): Promise<ScoredMember[]> {
  const { data: paid, error } = await supabase
    .from('members')
    .select('mindbody_client_id, first_name, last_name, last_visit_date, total_visit_count')
    .eq('status', 'active')
    .eq('has_paid_membership', true)
    .returns<PaidRow[]>();

  if (error) throw new Error(`computeScores: ${error.message}`);
  const rows = paid ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.mindbody_client_id);
  const windows = await tallyVisitWindows(supabase, ids);

  return rows.map((r) => {
    const w = windows.get(r.mindbody_client_id) ?? { last7: 0, prior7: 0, last30: 0, prior30: 0 };
    const dslv = daysSinceSydney(r.last_visit_date);
    const { score, band, reasons } = computeHealthScore({
      last7: w.last7,
      prior7: w.prior7,
      last30: w.last30,
      prior30: w.prior30,
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

export async function computeAndStoreHealthScores(): Promise<{
  scored: number;
  high: number;
  medium: number;
  healthy: number;
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
    updated,
    errors,
    durationMs: Date.now() - started,
  };
}
