-- Every message attempt to a member, through the one dispatch() door.
--
-- Local .env.local and Vercel production share ONE Supabase project. Until now
-- a local run of /api/milestones/cron messaged real members and wrote the
-- dedupe row that made the real 21:00 run skip them. dispatch() gates on
-- VERCEL_ENV === 'production' and writes every attempt here: sent, suppressed
-- (the local dry-run artefact), redirected (OUTBOUND_REDIRECT_TO), or failed.
--
-- milestone_log also gains the runtime that wrote each row, so a local run
-- can never consume production's daily dedupe slot again.
--
-- Creates one table, adds one column. Deletes nothing. Safe to run twice.

create table if not exists outbound_log (
  id            uuid primary key default gen_random_uuid(),
  channel       text not null check (channel in ('ghl_webhook','ghl_tag','email')),
  member_id     text,
  recipient     text not null,
  delivered_to  text,                       -- null unless sent/redirected
  purpose       text not null,
  payload       jsonb not null default '{}'::jsonb,
  status        text not null check (status in ('sent','suppressed','redirected','failed')),
  reason        text,
  runtime_env   text not null,              -- 'production' | 'preview' | 'local'
  created_at    timestamptz not null default now()
);

create index if not exists idx_outbound_log_member on outbound_log (member_id, created_at desc);
create index if not exists idx_outbound_log_created on outbound_log (created_at desc);

alter table outbound_log enable row level security;
drop policy if exists "authenticated read outbound" on outbound_log;
create policy "authenticated read outbound" on outbound_log
  for select using (auth.role() = 'authenticated');

alter table milestone_log
  add column if not exists runtime_env text not null default 'production';
