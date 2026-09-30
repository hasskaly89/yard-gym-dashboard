import { fromZonedTime } from 'date-fns-tz';
import { getMBToken, fetchMBClientVisits } from './api';
import { createAdminClient } from '@/lib/supabase/admin';

// Visit sync. Stores every class row MindBody returns for each paid member —
// attended, booked, no-show, late-cancel — with a status, and derives
// total_visit_count / last_visit_date (attended only) and next_booking_at
// (earliest future booking) on `members`. Crèche is excluded throughout.
//
// The response always carried bookings and no-shows; until 019 the sync
// dropped every row that wasn't SignedIn and never asked for a future
// EndDate. "No future sessions booked" is the strongest single signal in a
// retention narrative, and it was being paid for and discarded.
//
// COST — MindBody bills $0.002/call. Two modes:
//   'incremental' (default, nightly): fetches only visits SINCE each member's
//     last known visit. Steady-state that's ~1 page/member and does NOT grow
//     as visit history accumulates — this is what keeps the nightly bill tiny.
//   'backfill' (one-time / recovery): re-pulls full history since SINCE_DATE.
//     Only run this to seed an empty DB or repair gaps; it is expensive.

// MindBody returns StartDateTime as a NAIVE local datetime for the site's own
// timezone — "2026-08-21T17:30:00", no offset, no Z. `new Date()` parses that
// in the runtime's zone, which is UTC on Vercel, so a 5:30pm Sydney class was
// stored as 17:30Z: ten hours ahead of when it actually happened.
//
// Confirmed from the data on 2026-08-21 — stored hours clustered at 05, 06,
// 08, 09, 16, 17 and 18. Read as Sydney those are class times, including a
// 120-person 5am. Read as UTC they are a 3am class with 120 attendees.
//
// The skew matters because last_visit_date drives the inactivity tiers
// (7/14/21/30 days) and visit_at drives the week-over-week attendance compare.
// A ten-hour error moves visits across day and week boundaries.
const GYM_TZ = 'Australia/Sydney';

const SINCE_DATE = '2024-04-01';
const BATCH_SIZE = 30;
const BATCH_DELAY_MS = 200;
// Re-fetch a couple of days before the last known visit so a same-day or
// just-missed visit isn't skipped; duplicates are ignored on upsert.
const INCREMENTAL_OVERLAP_DAYS = 2;
// ...and never less than a week, so a booking that became an attendance or a
// no-show since the last run is seen again and its status updated.
const MIN_LOOKBACK_DAYS = 7;
// How far ahead to ask for bookings. Same call, same page — a member holds far
// fewer than 200 rows in this span.
const BOOKING_HORIZON_DAYS = 90;

export type VisitStatus = 'attended' | 'booked' | 'no_show' | 'late_cancelled';

// Field names confirmed from two live responses (13 Sep). AppointmentStatus
// read 'NoShow' on attended class rows, so it is not used; SignedIn,
// LateCancelled and the start time decide.
type Visit = {
  Id?: number | string | null;
  SignedIn?: boolean;
  LateCancelled?: boolean;
  Name?: string | null;
  StartDateTime?: string;
};

async function fetchAllVisits(
  token: string,
  clientId: string,
  startDate: string,
  endDate: string,
): Promise<Visit[]> {
  const visits: Visit[] = [];
  let offset = 0;
  const PAGE = 200;
  while (true) {
    const data = await fetchMBClientVisits(
      token,
      clientId,
      startDate,
      endDate,
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

type CleanVisit = {
  visitAt: string;
  className: string | null;
  status: VisitStatus;
  mbVisitId: number | null;
};

function statusFor(v: Visit, ts: number, nowMs: number): VisitStatus {
  if (v.SignedIn === true) return 'attended';
  if (v.LateCancelled === true) return 'late_cancelled';
  return ts > nowMs ? 'booked' : 'no_show';
}

function normaliseVisits(
  visits: Visit[],
  nowMs: number,
): {
  clean: CleanVisit[];
  lastVisit: string | null; // latest ATTENDED visit
} {
  const clean: CleanVisit[] = [];
  let lastTs = 0;
  for (const v of visits) {
    const name = (v.Name || '').toLowerCase();
    if (name.includes('creche')) continue;
    if (!v.StartDateTime) continue;
    // Respect an explicit offset if MindBody ever starts sending one; treat a
    // naive value as gym-local wall clock. fromZonedTime handles AEST/AEDT.
    const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(v.StartDateTime);
    const ts = hasOffset
      ? new Date(v.StartDateTime).getTime()
      : fromZonedTime(v.StartDateTime, GYM_TZ).getTime();
    if (Number.isNaN(ts)) continue;
    const status = statusFor(v, ts, nowMs);
    const idNum = typeof v.Id === 'string' ? Number(v.Id) : v.Id;
    clean.push({
      visitAt: new Date(ts).toISOString(),
      className: v.Name ?? null,
      status,
      mbVisitId: typeof idNum === 'number' && Number.isFinite(idNum) ? idNum : null,
    });
    if (status === 'attended' && ts > lastTs) lastTs = ts;
  }
  return {
    clean,
    lastVisit: lastTs > 0 ? new Date(lastTs).toISOString() : null,
  };
}

const ymd = (d: Date) => d.toISOString().split('T')[0];

// YYYY-MM-DD, `days` before the given ISO timestamp (or SINCE_DATE fallback),
// and never later than a week ago.
function startDateForWatermark(lastVisitDate: string | null, nowMs: number): string {
  const weekAgo = ymd(new Date(nowMs - MIN_LOOKBACK_DAYS * 86400000));
  if (!lastVisitDate) return SINCE_DATE;
  const d = new Date(lastVisitDate);
  if (Number.isNaN(d.getTime())) return SINCE_DATE;
  d.setDate(d.getDate() - INCREMENTAL_OVERLAP_DAYS);
  let iso = ymd(d);
  if (iso > weekAgo) iso = weekAgo;
  // Never look further back than the backfill floor.
  return iso < SINCE_DATE ? SINCE_DATE : iso;
}

type MemberRow = {
  mindbody_client_id: string;
  last_visit_date: string | null;
};

export type VisitSyncMode = 'incremental' | 'backfill';

export type VisitSyncResult = {
  mode: VisitSyncMode;
  scanned: number;
  // Members whose sync promise fulfilled — includes "nothing new for them".
  updated: number;
  // Rows genuinely written to member_visits this run.
  inserted: number;
  // Raw visit rows MindBody returned across all members, before any filter.
  visitsSeen: number;
  membersWithErrors: number;
  errorSamples: string[];
  startedAt: string;
  apiCalls: number;
  errors: string[];
  durationMs: number;
};

export async function syncMemberVisitCounts(opts?: {
  mode?: VisitSyncMode;
  // Cap the number of members processed — used for bounded, low-cost test runs.
  limit?: number;
}): Promise<VisitSyncResult> {
  const mode: VisitSyncMode = opts?.mode ?? 'incremental';
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const supabase = createAdminClient();
  // Three numbers the cron's abort guard cannot do without. `updated` counts
  // members whose promise settled — a member for whom MindBody returned an
  // empty list still counts as "updated". On 2026-09-12 every member did
  // exactly that: zero rows written, `updated` = 214, guard silent, messages
  // sent on stale data. `visitsSeen` (raw rows before any filter) is the
  // number that can't be zero on a healthy night, because the 2-day overlap
  // re-fetches visits we already hold.
  let inserted = 0;
  let visitsSeen = 0;

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
            : startDateForWatermark(m.last_visit_date, started);
        const endDate = ymd(new Date(started + BOOKING_HORIZON_DAYS * 86400000));

        const visits = await fetchAllVisits(
          token,
          m.mindbody_client_id,
          startDate,
          endDate,
        );
        visitsSeen += visits.length;
        const { clean, lastVisit } = normaliseVisits(visits, started);

        // Upsert per-visit history on (mindbody_client_id, visit_at). This is
        // a real update, not DO NOTHING: a row stored as 'booked' last night
        // must become 'attended' or 'no_show' once the class has happened.
        // Inserted rows are the ones whose created_at is this run's.
        if (clean.length > 0) {
          const rows = clean.map((v) => ({
            mindbody_client_id: m.mindbody_client_id,
            visit_at: v.visitAt,
            class_name: v.className,
            status: v.status,
            mindbody_visit_id: v.mbVisitId,
            last_seen_at: startedAt,
          }));
          for (let j = 0; j < rows.length; j += 500) {
            const chunk = rows.slice(j, j + 500);
            const { data: written, error: vErr } = await supabase
              .from('member_visits')
              .upsert(chunk, { onConflict: 'mindbody_client_id,visit_at' })
              .select('created_at');
            if (vErr) {
              throw new Error(`${m.mindbody_client_id} visits: ${vErr.message}`);
            }
            // Parse both sides: PostgREST returns +00:00, startedAt ends in Z.
            inserted += (written ?? []).filter(
              (r) => Date.parse(r.created_at) >= started,
            ).length;
          }
        }

        // A booking the member cancelled in time simply stops appearing in the
        // response. Any non-attended row inside this run's window that the
        // response did not mention has therefore gone — remove it. Attended
        // rows are never touched here, and an EMPTY response retires nothing:
        // on 2026-09-12 MindBody returned nothing for anyone, and that must
        // not read as "every booking was cancelled".
        if (visits.length > 0) {
          const { error: retireErr } = await supabase
            .from('member_visits')
            .delete()
            .eq('mindbody_client_id', m.mindbody_client_id)
            .neq('status', 'attended')
            .gte('visit_at', `${startDate}T00:00:00Z`)
            .lte('visit_at', `${endDate}T23:59:59Z`)
            .lt('last_seen_at', startedAt);
          if (retireErr) {
            throw new Error(`${m.mindbody_client_id} retire: ${retireErr.message}`);
          }
        }

        // Derive the authoritative totals from member_visits (the full stored
        // history), NOT from this run's pull — in incremental mode the pull
        // only contains recent visits. Attended rows only: a booking is not a
        // visit. This is a Supabase count, no MB cost.
        const { count, error: cErr } = await supabase
          .from('member_visits')
          .select('visit_at', { count: 'exact', head: true })
          .eq('mindbody_client_id', m.mindbody_client_id)
          .eq('status', 'attended');
        if (cErr) throw new Error(`${m.mindbody_client_id} count: ${cErr.message}`);

        // Earliest booking still ahead of now, or null — the "no future
        // sessions booked" signal.
        const { data: nextRow, error: nErr } = await supabase
          .from('member_visits')
          .select('visit_at')
          .eq('mindbody_client_id', m.mindbody_client_id)
          .eq('status', 'booked')
          .gt('visit_at', startedAt)
          .order('visit_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (nErr) throw new Error(`${m.mindbody_client_id} next booking: ${nErr.message}`);

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
            next_booking_at: nextRow?.visit_at ?? null,
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
    inserted,
    visitsSeen,
    membersWithErrors: errors.length,
    errorSamples: errors.slice(0, 5),
    startedAt,
    apiCalls: getMBCallCount(),
    errors,
    durationMs: Date.now() - started,
  };
}

// The subset of a run worth keeping in sync_state.meta — everything except the
// full per-member error list, which can be hundreds of lines. Hobby logs expire
// in an hour; this row is what's left to read the next morning.
export function visitSyncMeta(r: VisitSyncResult): Record<string, unknown> {
  return {
    mode: r.mode,
    startedAt: r.startedAt,
    scanned: r.scanned,
    updated: r.updated,
    inserted: r.inserted,
    visitsSeen: r.visitsSeen,
    membersWithErrors: r.membersWithErrors,
    errorSamples: r.errorSamples,
    apiCalls: r.apiCalls,
    durationMs: r.durationMs,
  };
}
