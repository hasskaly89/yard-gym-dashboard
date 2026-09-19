-- Daily health-score history. Run in the Supabase SQL Editor.
--
-- The dashboard has only ever known each member's score RIGHT NOW: every
-- nightly run overwrote the last. That is why it could not say "dropped 17
-- points since 31 August", could not draw a member's score over time, and did
-- not notice when migration 014 moved 220 members' scores in one night.
--
-- One row per paid member per Sydney calendar day, written by
-- runRetentionScoring() (src/lib/retention/snapshots.ts). The window counts are
-- stored alongside the score so a future change to the formula can be replayed
-- over history rather than breaking the series.
--
-- ~210 rows/night, ~77k rows/year. Kept indefinitely.
--
-- Safe to run more than once.

create table if not exists member_score_snapshots (
  mindbody_client_id     text        not null,
  snapshot_date          date        not null,   -- Sydney calendar date of the run
  score                  smallint    not null,
  band                   text        not null check (band in ('healthy','medium','high')),
  trend_category         text        check (trend_category in ('STABLE','SLOWING','SLIDING','STOPPED')),
  last7                  smallint    not null default 0,
  prior7                 smallint    not null default 0,
  last30                 smallint    not null default 0,
  prior30                smallint    not null default 0,
  last56                 smallint    not null default 0,
  prior56                smallint    not null default 0,
  days_since_last_visit  smallint,
  created_at             timestamptz not null default now(),
  primary key (mindbody_client_id, snapshot_date)
);

create index if not exists idx_score_snapshots_date
  on member_score_snapshots (snapshot_date desc);

-- Written by the service role from the cron; read by signed-in staff.
alter table member_score_snapshots enable row level security;

drop policy if exists "authenticated read snapshots" on member_score_snapshots;
create policy "authenticated read snapshots" on member_score_snapshots
  for select using (auth.role() = 'authenticated');
