-- Two classes at the same start time are two visits. Run in the SQL Editor
-- BEFORE deploying the sync change that relies on it.
--
-- The unique key on member_visits was (member, visit_at). A member who signs
-- into RIG and TURF both at 5:30pm collides with themselves: since 019 started
-- keeping every row, the nightly upsert hit "ON CONFLICT DO UPDATE command
-- cannot affect row a second time" for 27 of 220 members every night from
-- 30 Sep, and those members got no new visits. (Before 019 the second class
-- was silently dropped, which is why it never showed.)
--
-- class_name is never null (checked: 0 of 49,255 rows), so adding it to the
-- key loses nothing. Safe to run more than once.

alter table member_visits
  drop constraint if exists member_visits_mindbody_client_id_visit_at_key;

alter table member_visits
  add constraint member_visits_client_time_class_key
  unique (mindbody_client_id, visit_at, class_name);
