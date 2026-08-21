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
// Hassan's seven membership tiers, confirmed against the MindBody Members
// report (the report's optMembership URL parameter IS the API's MembershipId):
//   11 Foundation Tier 1 · 12 TYG Membership · 26 Foundation Tier 2
//   27 VIP · 33 Black Friday Weekly · 42 Founders Day Weekly
//   43 Unlimited PIF 8 Week
// 24 (Influencer, Non-Fitness) was counted here but is a comp, not a paying
// member — 12 people. 42 and 43 were missing — 8 people who do pay.
// Net: 219 -> 215. NOTE this is a stored flag: the count only moves after
// syncMemberMemberships() re-runs.
export const ACTIVE_MEMBERSHIP_IDS = new Set<number>([11, 12, 26, 27, 33, 42, 43]);

const BATCH_SIZE = 30;
const BATCH_DELAY_MS = 200;

// How far back the narrow scope looks for a visit or a new client record.
const NARROW_WINDOW_DAYS = 60;

// 'full'   — every active client record (~1,635 on 2026-08-21). One MindBody
//            call each, ~$3.27. Exhaustive; nothing can be missed.
// 'narrow' — only clients who plausibly hold a membership, picked from three
//            free Supabase signals. Typically 400-600, ~$1.
export type MembershipSyncScope = 'full' | 'narrow';

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

export async function syncMemberMemberships(opts?: {
  // Cap the number of members checked — used for bounded, low-cost test runs.
  limit?: number;
  // Defaults to 'full' so every existing caller keeps today's behaviour.
  scope?: MembershipSyncScope;
}): Promise<{
  scope: MembershipSyncScope;
  scanned: number;
  paid: number;
  apiCalls: number;
  errors: string[];
  durationMs: number;
}> {
  const started = Date.now();
  const supabase = createAdminClient();

  // We only check members MindBody currently marks Active — anyone marked
  // inactive is automatically has_paid_membership = false (and a recent sync
  // run might have set them as such).
  //
  // `status = 'active'` mirrors MindBody's Client.Active flag (sync.ts), which
  // only means "this client record was never deactivated". It counted 1,635 on
  // 2026-08-21 while the actual membership base was ~218 — it sweeps in intro
  // offers, class packs, expired members and old trials. Checking all 1,635 at
  // one MindBody call each costs ~$3.27 to identify ~218 people.
  //
  // There is no bulk alternative: /client/activeclientmemberships rejects a
  // call without ClientId ("At least one of the following parameters must be
  // passed: ClientId, UniqueClientId"), and ClientIds plural fails the same
  // way. The fan-out is structural, so the only lever is WHO we look up.
  //
  // 'narrow' unions three free Supabase signals:
  //   - already flagged paid — catches churn, including the ~68 suspended
  //     members who pay but never visit
  //   - visited within NARROW_WINDOW_DAYS — catches anyone training
  //   - client record created within NARROW_WINDOW_DAYS — catches brand-new
  //     signups who haven't visited yet
  // A dormant non-member who buys a membership and never visits matches none
  // of the three, which is why the cron still runs a 'full' sweep monthly.
  //
  // Supabase / PostgREST silently caps select() at 1000 rows by default, so
  // we paginate explicitly with .range() — the members table has ~1.5k rows
  // and without this Paul Barbara (and ~500 others) were getting dropped.
  const scope: MembershipSyncScope = opts?.scope ?? 'full';
  // Date-only (YYYY-MM-DD), not a full ISO timestamp. A PostgREST `or=(...)`
  // filter containing `+00:00` decodes the `+` as a space and the comparison
  // silently matches nothing — which would shrink the candidate set to just
  // arm A and quietly stop checking anyone new. Verified: date-only compares
  // correctly against both last_visit_date (timestamptz) and
  // membership_start_date (date).
  const cutoff = new Date(Date.now() - NARROW_WINDOW_DAYS * 86400000)
    .toISOString()
    .slice(0, 10);

  const PAGE = 1000;
  const members: { mindbody_client_id: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from('members')
      .select('mindbody_client_id')
      .eq('status', 'active');
    if (scope === 'narrow') {
      query = query.or(
        [
          'has_paid_membership.is.true',
          `last_visit_date.gte.${cutoff}`,
          `membership_start_date.gte.${cutoff}`,
        ].join(','),
      );
    }
    const { data, error } = await query
      .order('mindbody_client_id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to load members: ${error.message}`);
    if (!data || data.length === 0) break;
    members.push(...data);
    if (data.length < PAGE) break;
    if (opts?.limit && members.length >= opts.limit) break;
  }
  if (opts?.limit) members.splice(opts.limit);

  const { resetMBCallCount, getMBCallCount } = await import('./api');
  resetMBCallCount();
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
  // Skipped in bounded test runs so a `limit` run stays side-effect-light.
  if (!opts?.limit) {
    await supabase
      .from('members')
      .update({ has_paid_membership: false })
      .neq('status', 'active');
  }

  return {
    scope,
    scanned: members.length,
    paid,
    apiCalls: getMBCallCount(),
    errors,
    durationMs: Date.now() - started,
  };
}
