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
  // Missed classes in the last 30 days — the rows the sync used to discard.
  noShows30: number;
  lateCancels30: number;
  // Median days between the member's last attended classes (up to 12 gaps),
  // null with fewer than 4 attended in the lookback. Their own cadence.
  usualGapDays: number | null;
};

// Median gap between consecutive timestamps (ms in, days out).
export function medianGapDays(sortedMs: number[]): number | null {
  const recent = sortedMs.slice(-13);
  if (recent.length < 4) return null;
  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i++) gaps.push((recent[i] - recent[i - 1]) / DAY);
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const med = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
  return Math.round(med * 10) / 10;
}

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
      noShows30: 0,
      lateCancels30: 0,
      usualGapDays: null,
    });
  }
  if (ids.length === 0) return counts;
  // Attended timestamps per member, ascending, for the rhythm measure.
  const attendedMs = new Map<string, number[]>();

  // PostgREST caps at 1000 rows/request; page until exhausted.
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: rows, error } = await supabase
      .from('member_visits')
      .select('mindbody_client_id, visit_at, status')
      .in('mindbody_client_id', ids)
      .gte('visit_at', sinceIso)
      .lte('visit_at', new Date(nowMs).toISOString()) // bookings are ahead of now; never a visit
      .order('visit_at', { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<{ mindbody_client_id: string; visit_at: string; status: string }[]>();

    if (error) throw new Error(`tallyVisitWindows: ${error.message}`);
    if (!rows || rows.length === 0) break;

    for (const r of rows) {
      const bucket = counts.get(r.mindbody_client_id);
      if (!bucket) continue;
      const ts = new Date(r.visit_at).getTime();
      if (Number.isNaN(ts)) continue;
      if (r.status !== 'attended') {
        if (ts >= last30Start) {
          if (r.status === 'no_show') bucket.noShows30++;
          else if (r.status === 'late_cancelled') bucket.lateCancels30++;
        }
        continue;
      }
      (attendedMs.get(r.mindbody_client_id) ?? attendedMs.set(r.mindbody_client_id, []).get(r.mindbody_client_id)!).push(ts);
      if (ts >= last7Start) bucket.last7++;
      else if (ts >= last14Start) bucket.prior7++;
      if (ts >= last30Start) bucket.last30++;
      else if (ts >= last60Start) bucket.prior30++;
      if (ts >= last56Start) bucket.last56++;
      else bucket.prior56++; // sinceIso already floors this at 112 days
    }

    if (rows.length < PAGE) break;
  }

  for (const [id, ms] of attendedMs) {
    const bucket = counts.get(id);
    if (bucket) bucket.usualGapDays = medianGapDays(ms); // rows arrive ascending
  }

  return counts;
}

// Same bucketing as above over visit timestamps already in memory, as of an
// arbitrary instant. The snapshot backfill replays 90 past days from one fetch
// instead of ninety.
export function tallyWindowsAsOf(visitMs: number[], asOfMs: number): VisitWindows {
  const w: VisitWindows = { last7: 0, prior7: 0, last30: 0, prior30: 0, last56: 0, prior56: 0, noShows30: 0, lateCancels30: 0, usualGapDays: null };
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
  w.usualGapDays = medianGapDays(visitMs.filter((t) => t <= asOfMs).sort((a, b) => a - b));
  return w;
}
