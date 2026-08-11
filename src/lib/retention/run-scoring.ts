import { createAdminClient } from '@/lib/supabase/admin';
import { computeScoresForPaidMembers, persistHealthScores } from './health';
import { generateSummariesForAtRisk } from '@/lib/ai/retention-summary';
import type { RiskBand } from './healthScore';

// Full nightly retention pass: score every paid member, persist scores, then
// (if an Anthropic key is configured) generate + persist AI "why + action"
// summaries for the at-risk members. Reads are Supabase-only (zero MindBody
// cost); the only external cost is the AI calls, bounded to at-risk members.

export async function runRetentionScoring(opts?: {
  withSummaries?: boolean;
}): Promise<{
  scored: number;
  high: number;
  medium: number;
  healthy: number;
  scoresUpdated: number;
  summariesWritten: number;
  errors: string[];
  durationMs: number;
}> {
  const started = Date.now();
  const supabase = createAdminClient();
  const errors: string[] = [];

  const scored = await computeScoresForPaidMembers(supabase);
  const { updated, errors: scoreErrors } = await persistHealthScores(scored, supabase);
  errors.push(...scoreErrors);

  let summariesWritten = 0;
  if (opts?.withSummaries !== false) {
    try {
      const summaries = await generateSummariesForAtRisk(scored);
      if (summaries.size > 0) {
        const now = new Date().toISOString();
        const entries = [...summaries.entries()];
        for (let i = 0; i < entries.length; i += 50) {
          const batch = entries.slice(i, i + 50);
          const results = await Promise.allSettled(
            batch.map(([id, summary]) =>
              supabase
                .from('members')
                .update({ ai_summary: summary, ai_summary_at: now })
                .eq('mindbody_client_id', id)
                .then(({ error }) => {
                  if (error) throw new Error(`${id} summary: ${error.message}`);
                }),
            ),
          );
          for (const r of results) {
            if (r.status === 'fulfilled') summariesWritten++;
            else errors.push(String(r.reason));
          }
        }
      }
    } catch (err) {
      errors.push(`ai summaries: ${(err as Error).message}`);
    }
  }

  const tally = (b: RiskBand) => scored.filter((s) => s.band === b).length;
  return {
    scored: scored.length,
    high: tally('high'),
    medium: tally('medium'),
    healthy: tally('healthy'),
    scoresUpdated: updated,
    summariesWritten,
    errors,
    durationMs: Date.now() - started,
  };
}
