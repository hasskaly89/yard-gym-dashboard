import { getMBToken, fetchMBActiveMemberships } from './api';
import { createAdminClient } from '@/lib/supabase/admin';

// Paid membership tiers — the canonical "this person is a current member"
// list. Must stay in sync with src/app/api/mindbody/retention/route.ts.
//   11 — TYG Membership | Foundation Tier 1
//   12 — TYG Membership
//   24 — TYG Membership | Influencer (Non-Fitness)
//   26 — Foundation T2 (legacy; no current holders observed in May 2026)
//   27 — TYG Membership | VIP
//   33 — TYG MEMBERSHIP | BLACK FRIDAY | WEEKLY
// TODO: Friends & Family Membership — ID unknown (no current holders in
// the May 2026 sample; ask Hassan to look it up in MindBody admin and
// add the ID here).
export const ACTIVE_MEMBERSHIP_IDS = new Set<number>([11, 12, 24, 26, 27, 33]);

const BATCH_SIZE = 30;
const BATCH_DELAY_MS = 200;

type MembershipRow = { MembershipId: number; Current: boolean };

async function memberHasPaidMembership(
  token: string,
  clientId: string,
): Promise<boolean> {
  const data = await fetchMBActiveMemberships(token, clientId);
  const rows: MembershipRow[] = data.ClientMemberships || [];
  return rows.some(
    (m) => m.Current && ACTIVE_MEMBERSHIP_IDS.has(m.MembershipId),
  );
}

export async function syncMemberMemberships(): Promise<{
  scanned: number;
  paid: number;
  errors: string[];
  durationMs: number;
}> {
  const started = Date.now();
  const supabase = createAdminClient();

  // We only check members MindBody currently marks Active — anyone marked
  // inactive is automatically has_paid_membership = false (and a recent sync
  // run might have set them as such).
  //
  // Supabase / PostgREST silently caps select() at 1000 rows by default, so
  // we paginate explicitly with .range() — the members table has ~1.5k rows
  // and without this Paul Barbara (and ~500 others) were getting dropped.
  const PAGE = 1000;
  const members: { mindbody_client_id: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('members')
      .select('mindbody_client_id')
      .eq('status', 'active')
      .order('mindbody_client_id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to load members: ${error.message}`);
    if (!data || data.length === 0) break;
    members.push(...data);
    if (data.length < PAGE) break;
  }

  const token = await getMBToken();
  const errors: string[] = [];
  let paid = 0;

  for (let i = 0; i < members.length; i += BATCH_SIZE) {
    const batch = members.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (m) => {
        const hasPaid = await memberHasPaidMembership(
          token,
          m.mindbody_client_id,
        );
        const { error: upErr } = await supabase
          .from('members')
          .update({ has_paid_membership: hasPaid })
          .eq('mindbody_client_id', m.mindbody_client_id);
        if (upErr) throw new Error(`${m.mindbody_client_id}: ${upErr.message}`);
        return hasPaid;
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value) paid++;
      } else {
        errors.push(String(r.reason));
      }
    }

    if (i + BATCH_SIZE < members.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  // Anyone NOT in the active list (i.e. status != 'active') should also have
  // has_paid_membership = false. Set this unconditionally as a safety net.
  await supabase
    .from('members')
    .update({ has_paid_membership: false })
    .neq('status', 'active');

  return {
    scanned: members.length,
    paid,
    errors,
    durationMs: Date.now() - started,
  };
}
