-- Repair the visit timestamps that migration 014 shifted a second time.
--
-- WHAT WENT WRONG
-- 014 assumed every row in member_visits was Sydney wall clock mislabelled as
-- UTC, and shifted the whole table. That was only true for rows written on
-- Vercel, where the runtime zone is UTC. Rows written by a sync run from a
-- laptop (TZ=Australia/Sydney) had been parsed correctly by the very same
-- pre-fix `new Date(v.StartDateTime)` code, because there the runtime zone
-- already WAS the gym's zone. 014 shifted those correct rows ten hours into
-- the past.
--
-- The cohorts separate cleanly by created_at, and the visit-hour histograms
-- confirm it (measured over all 46,299 rows on 2026-08-23):
--
--   created_at   rows    top visit hour       verdict
--   2026-05-31   39255   19Z = 5am Sydney     correct (Vercel, fixed by 014)
--   2026-08-10    4716   09Z = 7pm Sydney     WRONG   (laptop, broken by 014)
--   2026-08-12    1026   09Z = 7pm Sydney     WRONG   (laptop, broken by 014)
--   2026-08-21    1289   19Z = 5am Sydney     correct (Vercel, fixed by 014)
--   2026-08-22      13   21Z = 7am Sydney     correct (post-fix sync code)
--
-- The gym's anchor class is 5am. 19Z is 5am Sydney in AEST and 18Z in AEDT —
-- the two correct cohorts peak exactly there. The two broken cohorts peak ten
-- hours earlier, at a 7pm that does not exist on the timetable.
--
-- WHAT THIS DOES
-- Applies the exact inverse of 014 to the two broken cohorts only:
--   (visit_at AT TIME ZONE 'Australia/Sydney') AT TIME ZONE 'UTC'
-- reads each row's Sydney wall clock and reinterprets it as UTC. Unlike the
-- forward direction, the inverse is total — a definite instant always has one
-- unambiguous Sydney wall clock — so DST needs no special handling. Verified:
-- all 5,742 rows round-trip through 014's forward transform exactly, zero
-- ambiguous.
--
-- Duplicates: 885 of the broken rows are the same real class as a correct row
-- already in the table (both syncs saw it; the 10h skew let it past the unique
-- key). Those are deleted rather than shifted. Greg Da Corte's 7 Aug 5:55am
-- TURF is one of them, and it is why his board card read 4 visits in 30 days
-- when he attended 3.
--
-- Expected effect. The delete/shift targets are pinned to the 2026-08-10..13
-- created_at cohorts, which cannot grow, so the two counts hold on any date.
-- The table itself keeps growing nightly, so the final row count moves:
--   deleted:  885 rows
--   shifted: 4857 rows
--   member_visits: 46,299 -> 45,414 rows   (measured 2026-08-23)
--                  48,111 -> 47,226 rows   (re-measured 2026-09-13)
--
-- FORWARD FIX
-- src/lib/mindbody/sync-visits.ts (commit 6a6bb66) now uses fromZonedTime, so
-- new rows are correct regardless of the runtime zone. This is a one-time
-- repair of history, not a recurring correction.
--
-- ############ RUN ONCE, in the Supabase SQL Editor. ############
-- The guard below aborts if it has already run.

BEGIN;

-- Idempotency guard. 014 relied on a human reading a comment; this does not.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM sync_state WHERE key = 'visit_tz_repair_015') THEN
    RAISE EXCEPTION
      'Migration 015 already applied at %. Re-running would shift the corrected rows back into the past.',
      (SELECT last_run_at FROM sync_state WHERE key = 'visit_tz_repair_015');
  END IF;
END $$;

-- Same reason as 014: the unique key is checked row-by-row as the UPDATE walks
-- the table, so a row moving forward collides with one that has not moved yet.
-- Re-added before COMMIT, so a genuine duplicate aborts the whole transaction
-- instead of leaving the table half-repaired.
ALTER TABLE member_visits
  DROP CONSTRAINT member_visits_mindbody_client_id_visit_at_key;

-- 1. Drop the broken rows that duplicate a correct row once un-shifted.
DELETE FROM member_visits AS bad
WHERE bad.created_at >= '2026-08-10T00:00:00Z'
  AND bad.created_at <  '2026-08-13T00:00:00Z'
  AND EXISTS (
    SELECT 1
    FROM member_visits AS good
    WHERE good.mindbody_client_id = bad.mindbody_client_id
      AND (good.created_at <  '2026-08-10T00:00:00Z'
        OR good.created_at >= '2026-08-13T00:00:00Z')
      AND good.visit_at =
          (bad.visit_at AT TIME ZONE 'Australia/Sydney') AT TIME ZONE 'UTC'
  );

-- 2. Un-shift what remains of the two broken cohorts.
UPDATE member_visits
SET visit_at = (visit_at AT TIME ZONE 'Australia/Sydney') AT TIME ZONE 'UTC'
WHERE created_at >= '2026-08-10T00:00:00Z'
  AND created_at <  '2026-08-13T00:00:00Z';

ALTER TABLE member_visits
  ADD CONSTRAINT member_visits_mindbody_client_id_visit_at_key
  UNIQUE (mindbody_client_id, visit_at);

-- 3. Rebuild the derived columns on members. Both were wrong: total_visit_count
--    counted the duplicates, and last_visit_date was shifted by 014 for anyone
--    whose most recent visit came from a laptop sync. The nightly sync derives
--    both from member_visits anyway, so this is the same definition, applied now
--    rather than at 7:53am tomorrow.
UPDATE members AS m
SET last_visit_date   = v.max_visit,
    total_visit_count = v.n
FROM (
  SELECT mindbody_client_id, max(visit_at) AS max_visit, count(*) AS n
  FROM member_visits
  GROUP BY mindbody_client_id
) AS v
WHERE v.mindbody_client_id = m.mindbody_client_id;

INSERT INTO sync_state (key, last_run_at, meta)
VALUES (
  'visit_tz_repair_015',
  now(),
  '{"note":"Reversed migration 014 for the 2026-08-10 and 2026-08-12 sync cohorts, which were written with a Sydney-local runtime and did not need shifting."}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- VERIFY afterwards — the whole table should now agree on the 5am class.
-- Expect 19Z (AEST) and 18Z (AEDT) at the top, and no 09Z cluster.
--
--   SELECT extract(hour FROM visit_at) AS utc_hour, count(*)
--   FROM member_visits GROUP BY 1 ORDER BY 2 DESC LIMIT 6;
--
-- And Greg Da Corte (100000514) should show one 7 Aug visit, not two:
--
--   SELECT visit_at AT TIME ZONE 'Australia/Sydney' AS sydney_time, class_name
--   FROM member_visits
--   WHERE mindbody_client_id = '100000514' AND visit_at > now() - interval '40 days'
--   ORDER BY visit_at DESC;
