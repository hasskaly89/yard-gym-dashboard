import { getMBToken, fetchMBClientVisits } from './api';
import { createAdminClient } from '@/lib/supabase/admin';

// Visit sync. Counts signed-in classes per active member, mirroring the filter
// used in /api/mindbody/retention so the numbers match the MindBody
// "Attendance Analysis" report:
//   - SignedIn === true (excludes no-show + late cancel)
//   - excludes crèche
// Writes per-visit rows to `member_visits` and total_visit_count +
// last_visit_date to `members`.
//
// COST — MindBody bills $0.002/call. Two modes:
//   'incremental' (default, nightly): fetches only visits SINCE each member's
//     last known visit. Steady-state that's ~1 page/member and does NOT grow
//     as visit history accumulates — this is what keeps the nightly bill tiny.
//   'backfill' (one-time / recovery): re-pulls full history since SINCE_DATE.
//     Only run this to seed an empty DB or repair gaps; it is expensive.

const SINCE_DATE = '2024-04-01';
const BATCH_SIZE = 30;
const BATCH_DELAY_MS = 200;
// Re-fetch a couple of days before the last known visit so a same-day or
// just-missed visit isn't skipped; duplicates are ignored on upsert.
const INCREMENTAL_OVERLAP_DAYS = 2;

type Visit = {
  SignedIn?: boolean;
  Name?: string | null;
  StartDateTime?: string;
};

async function fetchAllSignedInVisits(
  token: string,
  clientId: string,
  startDate: string,
): Promise<Visit[]> {
  const visits: Visit[] = [];
  let offset = 0;
  const PAGE = 200;
  while (true) {
    const data = await fetchMBClientVisits(
      token,
      clientId,
      startDate,
      undefined,
      offset,
      PAGE,
    );
    const page: Visit[] = data.Visits || [];
    visits.push(...page);
    const total = data.PaginationResponse?.TotalResults ?? 0;
    offset += PAGE;
    if (offset >= total || page.length === 0) break;
  }
  return visits;
}

type CleanVisit = { visitAt: string; className: string | null };

function filterSignedInClasses(visits: Visit[]): {
  clean: CleanVisit[];
  lastVisit: string | null;
} {
  const clean: CleanVisit[] = [];
  let lastTs = 0;
  for (const v of visits) {
    if (v.SignedIn !== true) continue;
    const name = (v.Name || '').toLowerCase();
    if (name.includes('creche')) continue;
    if (!v.StartDateTime) continue;
    const ts = new Date(v.StartDateTime).getTime();
    if (Number.isNaN(ts)) continue;
    clean.push({ visitAt: new Date(ts).toISOString(), className: v.Name ?? null });
    if (ts > lastTs) lastTs = ts;
  }
  return {
    clean,
    lastVisit: lastTs > 0 ? new Date(lastTs).toISOString() : null,
  };
}

// YYYY-MM-DD, `days` before the given ISO timestamp (or SINCE_DATE fallback).
function startDateForWatermark(lastVisitDate: string | null): string {
  if (!lastVisitDate) return SINCE_DATE;
  const d = new Date(lastVisitDate);
  if (Number.isNaN(d.getTime())) return SINCE_DATE;
  d.setDate(d.getDate() - INCREMENTAL_OVERLAP_DAYS);
  const iso = d.toISOString().split('T')[0];
  // Never look further back than the backfill floor.
  return iso < SINCE_DATE ? SINCE_DATE : iso;
}

type MemberRow = {
  mindbody_client_id: string;
  last_visit_date: string | null;
};

export type VisitSyncMode = 'incremental' | 'backfill';

export async function syncMemberVisitCounts(opts?: {
  mode?: VisitSyncMode;
  // Cap the number of members processed — used for bounded, low-cost test runs.
  limit?: number;
}): Promise<{
  mode: VisitSyncMode;
  scanned: number;
  updated: number;
  apiCalls: number;
  errors: string[];
  durationMs: number;
}> {
  const mode: VisitSyncMode = opts?.mode ?? 'incremental';
  const started = Date.now();
  const supabase = createAdminClient();

  // Restrict the visit sync to paid current members — no point counting visits
  // for trial passes or ex-members, and it cuts MindBody load. Run
  // syncMemberMemberships() first to keep has_paid_membership fresh.
  let query = supabase
    .from('members')
    .select('mindbody_client_id, last_visit_date')
    .eq('status', 'active')
    .eq('has_paid_membership', true)
    .order('mindbody_client_id');
  if (opts?.limit) query = query.limit(opts.limit);

  const { data: members, error } = await query.returns<MemberRow[]>();

  if (error || !members) {
    throw new Error(`Failed to load paid members: ${error?.message}`);
  }

  const { resetMBCallCount, getMBCallCount } = await import('./api');
  resetMBCallCount();
  const token = await getMBToken();
  const errors: string[] = [];
  let updated = 0;

  for (let i = 0; i < members.length; i += BATCH_SIZE) {
    const batch = members.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (m) => {
        const startDate =
          mode === 'backfill'
            ? SINCE_DATE
            : startDateForWatermark(m.last_visit_date);

        const visits = await fetchAllSignedInVisits(
          token,
          m.mindbody_client_id,
          startDate,
        );
        const { clean, lastVisit } = filterSignedInClasses(visits);

        // Upsert per-visit history. Unique (mindbody_client_id, visit_at) makes
        // this idempotent, so incremental runs with overlap never double-count.
        if (clean.length > 0) {
          const rows = clean.map((v) => ({
            mindbody_client_id: m.mindbody_client_id,
            visit_at: v.visitAt,
            class_name: v.className,
          }));
          for (let j = 0; j < rows.length; j += 500) {
            const chunk = rows.slice(j, j + 500);
            const { error: vErr } = await supabase
              .from('member_visits')
              .upsert(chunk, {
                onConflict: 'mindbody_client_id,visit_at',
                ignoreDuplicates: true,
              });
            if (vErr) {
              throw new Error(`${m.mindbody_client_id} visits: ${vErr.message}`);
            }
          }
        }

        // Derive the authoritative totals from member_visits (the full stored
        // history), NOT from this run's pull — in incremental mode the pull
        // only contains recent visits. This is a Supabase count, no MB cost.
        const { count, error: cErr } = await supabase
          .from('member_visits')
          .select('visit_at', { count: 'exact', head: true })
          .eq('mindbody_client_id', m.mindbody_client_id);
        if (cErr) throw new Error(`${m.mindbody_client_id} count: ${cErr.message}`);

        // last_visit_date = latest of what we already had and what we just saw.
        const existing = m.last_visit_date
          ? new Date(m.last_visit_date).getTime()
          : 0;
        const fresh = lastVisit ? new Date(lastVisit).getTime() : 0;
        const newLastVisit =
          fresh > existing
            ? lastVisit
            : m.last_visit_date ?? lastVisit;

        const { error: upErr } = await supabase
          .from('members')
          .update({
            total_visit_count: count ?? 0,
            last_visit_date: newLastVisit,
          })
          .eq('mindbody_client_id', m.mindbody_client_id);
        if (upErr) throw new Error(`${m.mindbody_client_id}: ${upErr.message}`);
        return true;
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') updated++;
      else errors.push(String(r.reason));
    }

    // MindBody rate-limits aggressively; brief pause between batches.
    if (i + BATCH_SIZE < members.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return {
    mode,
    scanned: members.length,
    updated,
    apiCalls: getMBCallCount(),
    errors,
    durationMs: Date.now() - started,
  };
}
