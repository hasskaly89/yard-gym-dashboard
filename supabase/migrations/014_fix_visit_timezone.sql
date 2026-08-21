-- Correct visit timestamps that were stored as Sydney wall clock labelled UTC.
--
-- MindBody returns StartDateTime as a naive local datetime ("2026-08-21T17:30:00").
-- new Date() parsed that in the runtime zone — UTC on Vercel — so a 5:30pm
-- Sydney class landed in the database as 17:30Z, ten hours ahead of the real
-- instant. Fixed forward in src/lib/mindbody/sync-visits.ts; this repairs the
-- rows written before that fix.
--
-- The conversion reinterprets each stored wall clock as Sydney local and
-- resolves it to the true instant. It is DST-aware, so visits from AEDT months
-- shift by 11 hours and AEST months by 10.
--
-- ############ RUN ONCE. ############
-- Running it twice shifts the data a second time. Check first:
--
--   SELECT max(visit_at) FROM member_visits;
--
-- If the newest visit is in the FUTURE relative to now(), the fix has not been
-- applied yet and this migration should run. If it is in the past, stop.

BEGIN;

UPDATE member_visits
SET visit_at = (visit_at AT TIME ZONE 'UTC') AT TIME ZONE 'Australia/Sydney';

UPDATE members
SET last_visit_date = (last_visit_date AT TIME ZONE 'UTC') AT TIME ZONE 'Australia/Sydney'
WHERE last_visit_date IS NOT NULL;

COMMIT;

-- Verify: the newest visit should now be in the past, and the hour histogram
-- below should show classes at 19:00-20:00 UTC (5am-6am Sydney) rather than
-- 05:00 UTC.
--
--   SELECT extract(hour FROM visit_at) AS utc_hour, count(*)
--   FROM member_visits GROUP BY 1 ORDER BY 1;
