-- Correct visit timestamps that were stored as Sydney wall clock labelled UTC.
--
-- MindBody returns StartDateTime as a naive local datetime ("2026-08-21T17:30:00").
-- new Date() parsed that in the runtime zone — UTC on Vercel — so a 5:30pm
-- Sydney class landed in the database as 17:30Z, ten hours ahead of the real
-- instant. Fixed forward in src/lib/mindbody/sync-visits.ts; this repairs the
-- rows written before that fix.
--
-- The conversion reinterprets each stored wall clock as Sydney local and
-- resolves it to the true instant. It is DST-aware: AEDT rows shift 11 hours,
-- AEST rows 10.
--
-- WHY THE CONSTRAINT IS DROPPED FIRST
-- unique (mindbody_client_id, visit_at) is checked row-by-row as the UPDATE
-- walks the table, not at the end. A 5:55am visit shifting back to 19:55 the
-- previous day collides with that member's genuine 7:55pm visit, which has not
-- been shifted yet. The collision is transient — once both rows move, they are
-- distinct again. Verified against all 46,014 rows on 2026-08-21: 46,014
-- distinct keys after the shift, zero duplicates, zero rows in a DST-ambiguous
-- hour. Re-adding the constraint inside the transaction is the safety net: if
-- a genuine duplicate ever did exist, the ADD fails and the whole thing rolls
-- back rather than leaving the data half-shifted.
--
-- ############ RUN ONCE. ############
-- Running it twice shifts the data a second time. Check first:
--
--   SELECT max(visit_at) FROM member_visits;
--
-- If the newest visit is in the FUTURE relative to now(), the fix has not been
-- applied yet and this migration should run. If it is already in the past, stop.

BEGIN;

ALTER TABLE member_visits
  DROP CONSTRAINT member_visits_mindbody_client_id_visit_at_key;

UPDATE member_visits
SET visit_at = (visit_at AT TIME ZONE 'UTC') AT TIME ZONE 'Australia/Sydney';

UPDATE members
SET last_visit_date = (last_visit_date AT TIME ZONE 'UTC') AT TIME ZONE 'Australia/Sydney'
WHERE last_visit_date IS NOT NULL;

ALTER TABLE member_visits
  ADD CONSTRAINT member_visits_mindbody_client_id_visit_at_key
  UNIQUE (mindbody_client_id, visit_at);

COMMIT;

-- Verify: the newest visit should now be in the past, and the busiest hours
-- should sit at 19:00-20:00 UTC (5am-6am Sydney) rather than 05:00 UTC.
--
--   SELECT extract(hour FROM visit_at) AS utc_hour, count(*)
--   FROM member_visits GROUP BY 1 ORDER BY 2 DESC LIMIT 5;
