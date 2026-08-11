import type { SupabaseClient } from '@supabase/supabase-js';

// Shared visit-window tally used by both the retention board and the
// health-score engine, so the two always agree on the same numbers. Reads
// member_visits (synced nightly) — ZERO MindBody calls.

export type VisitWindows = {
  last7: number;
  prior7: number;
  last30: number;
  prior30: number;
};

// Tallies last-7 / prior-7 / last-30 / prior-30 day visit counts for the given
// member ids from member_visits, over a 60-day lookback.
export async function tallyVisitWindows(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, VisitWindows>> {
  const nowMs = Date.now();
  const last7Start = nowMs - 7 * 86400000;
  const last14Start = nowMs - 14 * 86400000;
  const last30Start = nowMs - 30 * 86400000;
  const last60Start = nowMs - 60 * 86400000;
  const sinceIso = new Date(last60Start).toISOString();

  const counts = new Map<string, VisitWindows>();
  for (const id of ids) {
    counts.set(id, { last7: 0, prior7: 0, last30: 0, prior30: 0 });
  }
  if (ids.length === 0) return counts;

  // PostgREST caps at 1000 rows/request; page until exhausted.
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: rows, error } = await supabase
      .from('member_visits')
      .select('mindbody_client_id, visit_at')
      .in('mindbody_client_id', ids)
      .gte('visit_at', sinceIso)
      .order('visit_at', { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<{ mindbody_client_id: string; visit_at: string }[]>();

    if (error) throw new Error(`tallyVisitWindows: ${error.message}`);
    if (!rows || rows.length === 0) break;

    for (const r of rows) {
      const bucket = counts.get(r.mindbody_client_id);
      if (!bucket) continue;
      const ts = new Date(r.visit_at).getTime();
      if (Number.isNaN(ts)) continue;
      if (ts >= last7Start) bucket.last7++;
      else if (ts >= last14Start) bucket.prior7++;
      if (ts >= last30Start) bucket.last30++;
      else if (ts >= last60Start) bucket.prior30++;
    }

    if (rows.length < PAGE) break;
  }

  return counts;
}
