import { getMBToken, fetchMBClientVisits } from './api';
import { createAdminClient } from '@/lib/supabase/admin';

// Visit-count sync. Counts signed-in classes per active member since the
// SINCE_DATE, mirroring the filter used in /api/mindbody/retention so the
// numbers match the MindBody "Attendance Analysis" report:
//   - SignedIn === true (excludes no-show + late cancel)
//   - excludes crèche
// Writes total_visit_count + last_visit_date to the `members` table.

const SINCE_DATE = '2024-04-01';
const BATCH_SIZE = 30;
const BATCH_DELAY_MS = 200;

type Visit = {
  SignedIn?: boolean;
  Name?: string | null;
  StartDateTime?: string;
};

async function fetchAllSignedInVisits(
  token: string,
  clientId: string,
): Promise<Visit[]> {
  const visits: Visit[] = [];
  let offset = 0;
  const PAGE = 200;
  while (true) {
    const data = await fetchMBClientVisits(
      token,
      clientId,
      SINCE_DATE,
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

function countSignedInClasses(visits: Visit[]): {
  count: number;
  lastVisit: string | null;
} {
  let count = 0;
  let lastTs = 0;
  for (const v of visits) {
    if (v.SignedIn !== true) continue;
    const name = (v.Name || '').toLowerCase();
    if (name.includes('creche')) continue;
    count++;
    if (v.StartDateTime) {
      const ts = new Date(v.StartDateTime).getTime();
      if (!Number.isNaN(ts) && ts > lastTs) lastTs = ts;
    }
  }
  return {
    count,
    lastVisit: lastTs > 0 ? new Date(lastTs).toISOString() : null,
  };
}

export async function syncMemberVisitCounts(): Promise<{
  scanned: number;
  updated: number;
  errors: string[];
  durationMs: number;
}> {
  const started = Date.now();
  const supabase = createAdminClient();

  const { data: members, error } = await supabase
    .from('members')
    .select('mindbody_client_id')
    .eq('status', 'active');

  if (error || !members) {
    throw new Error(`Failed to load active members: ${error?.message}`);
  }

  const token = await getMBToken();
  const errors: string[] = [];
  let updated = 0;

  for (let i = 0; i < members.length; i += BATCH_SIZE) {
    const batch = members.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (m) => {
        const visits = await fetchAllSignedInVisits(token, m.mindbody_client_id);
        const { count, lastVisit } = countSignedInClasses(visits);
        const { error: upErr } = await supabase
          .from('members')
          .update({
            total_visit_count: count,
            last_visit_date: lastVisit,
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
    scanned: members.length,
    updated,
    errors,
    durationMs: Date.now() - started,
  };
}
