-- Per-visit history for milestones / monthly leaderboards.
-- Row per signed-in (non-crèche) class attendance.

create table if not exists member_visits (
  id uuid primary key default gen_random_uuid(),
  mindbody_client_id text not null,
  visit_at timestamptz not null,
  class_name text,
  created_at timestamptz not null default now(),
  unique (mindbody_client_id, visit_at)
);

create index if not exists idx_member_visits_visit_at
  on member_visits(visit_at desc);

create index if not exists idx_member_visits_member_at
  on member_visits(mindbody_client_id, visit_at desc);

-- RLS: only admin (service role) writes this from the cron; reads via
-- /api/milestones run with the admin client too. No user-facing RLS needed.
alter table member_visits enable row level security;

drop policy if exists "authenticated read visits" on member_visits;
create policy "authenticated read visits" on member_visits
  for select using (auth.role() = 'authenticated');
