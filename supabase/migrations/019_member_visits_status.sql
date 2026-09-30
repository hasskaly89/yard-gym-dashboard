-- Keep the bookings, no-shows and late-cancels MindBody already sends us.
-- Run in the SQL Editor BEFORE deploying the code that writes it.
--
-- /client/clientvisits returns every booking, not just attendances — that is
-- why SignedIn exists. The sync discarded every row where SignedIn was false,
-- and never asked for an EndDate, so a member's future bookings (rows with a
-- future StartDateTime) were fetched, paid for, and thrown away. Two probes
-- (13 Sep, $0.008 total) confirmed the payload: a member with "Tomorrow 6:50
-- AM" on Recovr's card had four future rows with AppointmentStatus 'Booked'
-- and one with LateCancelled true.
--
-- Same call, EndDate ninety days forward, and the rows are kept with a status.
-- "No future sessions booked" is the single strongest signal in every Recovr
-- narrative; this is where it comes from. Zero additional MindBody calls.
--
-- Every existing row is an attendance (only SignedIn rows were ever written),
-- so the default is correct for history. Every reader now filters on
-- status = 'attended' — a booking must never count as a visit.
--
-- Creates columns only. Deletes nothing. Safe to run more than once.

alter table member_visits
  add column if not exists status text not null default 'attended'
    check (status in ('attended','booked','no_show','late_cancelled')),
  add column if not exists mindbody_visit_id bigint,
  add column if not exists last_seen_at timestamptz;

create index if not exists idx_member_visits_non_attended
  on member_visits (mindbody_client_id, visit_at)
  where status <> 'attended';

alter table members
  add column if not exists next_booking_at timestamptz;
