import { createAdminClient } from '@/lib/supabase/admin';
import {
  computeScoresForPaidMembers,
  persistHealthScores,
  clearStaleScores,
} from './health';
import { writeDailySnapshots } from './snapshots';
import { generateSummariesForAtRisk, needsSummary } from '@/lib/ai/retention-summary';
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
  lost: number;
  scoresUpdated: number;
  summariesWritten: number;
  // At-risk members whose summary was left alone because nothing had moved.
  summariesSkipped: number;
  summariesCleared: number;
  ghostScoresCleared: number;
  snapshotsWritten: number;
  errors: string[];
  durationMs: number;
}> {
  const started = Date.now();
  const supabase = createAdminClient();
  const errors: string[] = [];

  const scored = await computeScoresForPaidMembers(supabase);
  const { updated, errors: scoreErrors } = await persistHealthScores(scored, supabase);
  errors.push(...scoreErrors);

  const cleared = await clearStaleScores(scored, supabase);
  errors.push(...cleared.errors);

  // History first, summaries second: a snapshot is a Supabase write that cannot
  // fail for reasons of its own, and must not be lost to an Anthropic timeout.
  const snapshots = await writeDailySnapshots(scored, supabase);
  errors.push(...snapshots.errors);

  const atRiskCount = scored.filter((m) => m.band === 'high' || m.band === 'medium').length;
  const dueCount = scored.filter(needsSummary).length;

  let summariesWritten = 0;
  if (opts?.withSummaries !== false) {
    try {
      // Context for the members whose summary is due tonight — the notes
      // thread, the last contact, the current package. The notesById option
      // existed since August and was never passed; member_notes had 0 rows,
      // and now that the drawer can write them they must reach the model.
      const due = scored.filter(needsSummary).map((m) => m.id);
      const [notesRes, contactsRes, memRes] = due.length
        ? await Promise.all([
            supabase
              .from('member_notes')
              .select('member_id, note, created_at')
              .in('member_id', due)
              .gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString())
              .order('created_at', { ascending: false }),
            supabase
              .from('member_contacts')
              .select('member_id, contacted_at, channel, outcome')
              .in('member_id', due)
              .gte('contacted_at', new Date(Date.now() - 60 * 86400000).toISOString())
              .order('contacted_at', { ascending: false }),
            supabase
              .from('member_memberships')
              .select('mindbody_client_id, name, kind, expiration_date, still_returned, last_seen_at')
              .in('mindbody_client_id', due)
              .eq('kind', 'paid'),
          ])
        : [{ data: [] }, { data: [] }, { data: [] }];

      const notesById = new Map<string, string[]>();
      for (const n of notesRes.data ?? []) {
        const list = notesById.get(n.member_id) ?? [];
        if (list.length < 3) list.push(n.note);
        notesById.set(n.member_id, list);
      }
      const contactsById = new Map<string, { daysAgo: number; channel: string | null; outcome: string | null }>();
      for (const c of contactsRes.data ?? []) {
        if (contactsById.has(c.member_id)) continue; // newest first
        contactsById.set(c.member_id, {
          daysAgo: Math.round((Date.now() - new Date(c.contacted_at).getTime()) / 86400000),
          channel: c.channel,
          outcome: c.outcome,
        });
      }
      const today = new Date().toISOString().slice(0, 10);
      const membershipById = new Map<string, { name: string; daysToExpiry: number | null; justExpired: boolean }>();
      for (const r of memRes.data ?? []) {
        const cur = membershipById.get(r.mindbody_client_id);
        if (cur && !cur.justExpired) continue; // keep the first current one
        const justExpired = !r.still_returned && Date.now() - new Date(r.last_seen_at).getTime() < 14 * 86400000;
        if (!r.still_returned && !justExpired) continue;
        membershipById.set(r.mindbody_client_id, {
          name: r.name ?? 'Membership',
          daysToExpiry: r.expiration_date ? Math.round((Date.parse(r.expiration_date) - Date.parse(today)) / 86400000) : null,
          justExpired,
        });
      }

      const summaries = await generateSummariesForAtRisk(scored, { notesById, contactsById, membershipById });
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
    lost: tally('lost'),
    scoresUpdated: updated,
    summariesWritten,
    summariesSkipped: atRiskCount - dueCount,
    summariesCleared: cleared.summariesCleared,
    ghostScoresCleared: cleared.ghostScoresCleared,
    snapshotsWritten: snapshots.written,
    errors,
    durationMs: Date.now() - started,
  };
}
