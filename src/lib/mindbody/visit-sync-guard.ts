import type { SupabaseClient } from '@supabase/supabase-js';
import type { VisitSyncResult } from './sync-visits';

// The cron's abort-before-send decision, as a pure function.
//
// The old guard was `scanned > 0 && updated === 0`. `updated` counts members
// whose sync promise fulfilled — and a member for whom MindBody returned an
// empty list fulfils just fine. On 2026-09-12 that happened for all 214: zero
// rows written, `updated` = 214, guard silent, inactivity messages sent on
// last_visit_date that was a day stale. This looks at what MindBody actually
// returned and what actually landed in the table.
//
// Returns the reason the run is untrustworthy, or null when it is fine.
export function systemicVisitSyncFailure(
  v: VisitSyncResult,
  baselineLastWeek: number,
): string | null {
  if (v.scanned === 0) return null;

  if (v.updated === 0) {
    return `scanned ${v.scanned} members and updated none`;
  }

  // The incremental window overlaps the last known visit by two days, so a
  // healthy run re-fetches visits we already hold. Zero raw rows across every
  // member is not "a quiet night" — it is MindBody returning nothing.
  if (v.visitsSeen === 0) {
    return `MindBody returned zero visit rows across ${v.scanned} members — impossible with the overlap window`;
  }

  const threshold = Math.max(10, Math.ceil(v.scanned * 0.1));
  if (v.membersWithErrors >= threshold) {
    return `${v.membersWithErrors} of ${v.scanned} members errored (threshold ${threshold}): ${v.errorSamples.join(' | ')}`;
  }

  // Nothing new written, on a slot that had real attendance a week ago.
  if (v.inserted === 0 && baselineLastWeek >= 5) {
    return `zero new visits written, but the same 24h window last week had ${baselineLastWeek}`;
  }

  return null;
}

// Attendance in the same 24h window seven days earlier — one free Supabase
// count. Sunday-morning runs compare against last Sunday morning, so a quiet
// weekend never trips the guard on its own.
export async function countVisitsSameWindowLastWeek(
  supabase: SupabaseClient,
  runStartedAtIso: string,
): Promise<number> {
  const end = new Date(runStartedAtIso);
  end.setDate(end.getDate() - 7);
  const start = new Date(end);
  start.setDate(start.getDate() - 1);
  const { count } = await supabase
    .from('member_visits')
    .select('id', { count: 'exact', head: true })
    .gte('visit_at', start.toISOString())
    .lt('visit_at', end.toISOString());
  return count ?? 0;
}
