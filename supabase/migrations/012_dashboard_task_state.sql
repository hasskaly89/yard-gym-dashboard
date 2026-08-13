-- Per-task complete/snooze state for the home dashboard's task list. Tasks
-- are regenerated nightly from AI output with no stable id, so state is
-- keyed by a deterministic hash of (scope, title, source) computed the same
-- way client- and server-side — see src/lib/dashboard/taskId.ts.
-- Run this in Supabase SQL Editor.

create table if not exists dashboard_task_state (
  id text primary key,
  scope text not null check (scope in ('personal', 'business')),
  title text not null,
  completed_at timestamptz,
  snoozed_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table dashboard_task_state enable row level security;
-- Read/write via the service-role admin client only (server-side). No public policy.
