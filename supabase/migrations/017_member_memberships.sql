-- Keep the membership rows MindBody already sends us. Run in the SQL Editor.
--
-- The weekly membership sync calls /client/activeclientmemberships once per
-- candidate client (~277 calls a week, ~1,635 on the monthly full sweep) and
-- until now reduced each response to ONE BIT: has_paid_membership. The package
-- name, start and expiry dates, and sessions remaining were fetched, paid for
-- at $0.002 a call, and thrown away.
--
-- Those fields are what a Renewals queue ("membership expires today, nothing
-- booked") and a Conversions queue ("4 days left on their intro pack") are made
-- of. Storing them costs zero additional MindBody calls.
--
-- A table rather than columns on members, because a client can hold more than
-- one at a time — an intro offer and the membership they converted to, or a
-- class pack alongside a membership — and because a row that STOPS being
-- returned is itself the "package just ended" signal.
--
-- `raw` keeps the entire row exactly as MindBody sent it. The typed columns
-- beside it are a convenience mapped from documented field names that have not
-- yet been checked against a live response; if one turns out to be named
-- differently it can be re-derived from `raw` with a single UPDATE — no
-- re-fetch, no spend.
--
-- Creates one table. Deletes nothing. Safe to run more than once.

create table if not exists member_memberships (
  mindbody_client_id  text        not null,
  -- MindBody's ClientMembership.Id; falls back to "<MembershipId>-<ActiveDate>"
  -- if a row ever arrives without one.
  membership_key      text        not null,
  membership_id       integer,                 -- MembershipId: 11,12,26,27,33,42,43 = paid tiers
  kind                text        not null default 'other'
                        check (kind in ('paid','intro','class_pack','other')),
  name                text,
  program_name        text,
  active_date         date,
  expiration_date     date,
  payment_date        date,
  remaining_sessions  integer,
  total_sessions      integer,
  is_current          boolean     not null default true,   -- MindBody's own Current flag
  -- false once a sync of THIS client no longer returns the row
  still_returned      boolean     not null default true,
  raw                 jsonb       not null,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  primary key (mindbody_client_id, membership_key)
);

create index if not exists idx_member_memberships_client
  on member_memberships (mindbody_client_id);

create index if not exists idx_member_memberships_expiry
  on member_memberships (expiration_date)
  where still_returned;

-- Written by the service role from the sync; read by signed-in staff.
alter table member_memberships enable row level security;

drop policy if exists "authenticated read memberships" on member_memberships;
create policy "authenticated read memberships" on member_memberships
  for select using (auth.role() = 'authenticated');
