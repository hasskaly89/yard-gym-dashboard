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

export async function syncMemberVisitCounts(): Promise<{
  scanned: number;
  updated: number;
  errors: string[];
  durationMs: number;
}> {
  const started = Date.now();
  const supabase = createAdminClient();

  // Restrict the visit sync to paid current members — there's no point
  // counting visits for trial passes or ex-members for milestones, and it
  // cuts MindBody API load ~5x. Run syncMemberMemberships() first to keep
  // has_paid_membership fresh.
  const { data: members, error } = await supabase
    .from('members')
    .select('mindbody_client_id')
    .eq('status', 'active')
    .eq('has_paid_membership', true);

  if (error || !members) {
    throw new Error(`Failed to load paid members: ${error?.message}`);
  }

  const token = await getMBToken();
  const errors: string[] = [];
  let updated = 0;

  for (let i = 0; i < members.length; i += BATCH_SIZE) {
    const batch = members.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (m) => {
        const visits = await fetchAllSignedInVisits(token, m.mindbody_client_id);
        const { clean, lastVisit } = filterSignedInClasses(visits);

        // Upsert per-visit history. Unique (mindbody_client_id, visit_at)
        // makes this idempotent on repeated runs. Chunk in 500-row batches
        // so we stay under Supabase's request size limits for power users.
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
              throw new Error(
                `${m.mindbody_client_id} visits: ${vErr.message}`,
              );
            }
          }
        }

        const { error: upErr } = await supabase
          .from('members')
          .update({
            total_visit_count: clean.length,
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
