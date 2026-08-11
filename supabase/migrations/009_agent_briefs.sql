-- Agent briefs — the daily AI-generated task list + summary shown on the
-- Dashboard. One row per scope ('personal' | 'business'), upserted nightly.
-- Run this in Supabase SQL Editor.

create table if not exists agent_briefs (
  scope text primary key check (scope in ('personal', 'business')),
  generated_at timestamptz not null default now(),
  summary text,                       -- "how things are running" overview
  tasks jsonb not null default '[]',  -- [{title, detail, urgency, source}]
  emails_scanned int not null default 0,
  updated_at timestamptz not null default now()
);

alter table agent_briefs enable row level security;
-- Read via the service-role admin client only (server-side). No public policy.
