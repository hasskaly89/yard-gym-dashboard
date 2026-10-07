-- Did the message work? Recovr's Results engine, on our data.
--
-- Their definition, verbatim from the audit: "A 'Win' means the message
-- actually changed behaviour — not just that the member came back. We compare
-- each person's attendance in the 4 weeks after your message against what
-- they would likely have done anyway, based on their history before the
-- message. A result needs 28 days of post-message data before it's finalised."
--
-- One row per contact (member_contacts) and per cron inactivity message
-- (milestone_log). Written nightly; a row is 'awaiting' until the window
-- closes, then settles to win / no_impact / not_measured. The expected
-- attendance is the member's own prior 4 weeks, floored by half their prior
-- 8 weeks, so a member already recovering is not credited to the message.
--
-- Proof of concept on 7 Oct over 24 staff contacts with a full window:
-- 10 wins, 13 no impact, 1 not measured — a 43% win rate, Recovr's was 52%.
--
-- Creates one table. Deletes nothing. Safe to run twice.

create table if not exists contact_results (
  source        text not null check (source in ('contact','milestone')),
  source_id     uuid not null,
  member_id     text not null,
  contacted_at  timestamptz not null,
  channel       text,
  by_name       text,
  window_ends   timestamptz not null,            -- contacted_at + 28 days
  before_8wk    smallint not null default 0,     -- attended, 56d before
  before_4wk    smallint not null default 0,     -- attended, 28d before
  after_4wk     smallint not null default 0,     -- attended so far in the window
  expected      numeric(5,1) not null default 0,
  result        text not null check (result in ('awaiting','win','no_impact','not_measured')),
  leaning       text check (leaning in ('win','no_impact')),   -- while awaiting
  computed_at   timestamptz not null default now(),
  primary key (source, source_id)
);

create index if not exists idx_contact_results_member on contact_results (member_id, contacted_at desc);
create index if not exists idx_contact_results_result on contact_results (result, contacted_at desc);

alter table contact_results enable row level security;
drop policy if exists "authenticated read results" on contact_results;
create policy "authenticated read results" on contact_results
  for select using (auth.role() = 'authenticated');
