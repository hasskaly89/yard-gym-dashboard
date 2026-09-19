import type { SupabaseClient } from '@supabase/supabase-js';

// Shared visit-window tally used by both the retention board and the
// health-score engine, so the two always agree on the same numbers. Reads
// member_visits (synced nightly) — ZERO MindBody calls.

export type VisitWindows = {
  last7: number;
  prior7: number;
  last30: number;
  prior30: number;
  // The 8-week pair is what drives classification. 30-vs-30 is too short to
  // tell "recovering from a quiet month" apart from "leaving": a member who
  // trained twice in a bad month and three times in a worse one reads as +50%.
  // Eight weeks against the eight before it is the window Recovr compares on,
  // and it is long enough that one holiday cannot invert the verdict.
  last56: number;
  prior56: number;
};

const DAY = 86400000;

// Tallies visit counts for the given member ids from member_visits, over a
// 112-day lookback: 7/30-day pairs for display, 56-day pairs for scoring.
export async function tallyVisitWindows(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, VisitWindows>> {
  const nowMs = Date.now();
  const last7Start = nowMs - 7 * DAY;
  const last14Start = nowMs - 14 * DAY;
  const last30Start = nowMs - 30 * DAY;
  const last60Start = nowMs - 60 * DAY;
  const last56Start = nowMs - 56 * DAY;
  const last112Start = nowMs - 112 * DAY;
  const sinceIso = new Date(last112Start).toISOString();

  const counts = new Map<string, VisitWindows>();
  for (const id of ids) {
    counts.set(id, {
      last7: 0,
      prior7: 0,
      last30: 0,
      prior30: 0,
      last56: 0,
      prior56: 0,
    });
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
      if (ts >= last56Start) bucket.last56++;
      else bucket.prior56++; // sinceIso already floors this at 112 days
    }

    if (rows.length < PAGE) break;
  }

  return counts;
}

// Same bucketing as above over visit timestamps already in memory, as of an
// arbitrary instant. The snapshot backfill replays 90 past days from one fetch
// instead of ninety.
export function tallyWindowsAsOf(visitMs: number[], asOfMs: number): VisitWindows {
  const w: VisitWindows = { last7: 0, prior7: 0, last30: 0, prior30: 0, last56: 0, prior56: 0 };
  for (const ts of visitMs) {
    if (ts > asOfMs) continue;
    const age = asOfMs - ts;
    if (age < 7 * DAY) w.last7++;
    else if (age < 14 * DAY) w.prior7++;
    if (age < 30 * DAY) w.last30++;
    else if (age < 60 * DAY) w.prior30++;
    if (age < 56 * DAY) w.last56++;
    else if (age < 112 * DAY) w.prior56++;
  }
  return w;
}
