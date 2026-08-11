-- Sync cadence tracking
-- Run this in Supabase SQL Editor.
--
-- Lets background jobs record when a given sync last ran, so expensive
-- MindBody syncs (memberships) can run on a slower cadence than the nightly
-- cron. Service-role only; RLS on with no public policies.

create table if not exists sync_state (
  key text primary key,
  last_run_at timestamptz,
  meta jsonb,
  updated_at timestamptz not null default now()
);

alter table sync_state enable row level security;
