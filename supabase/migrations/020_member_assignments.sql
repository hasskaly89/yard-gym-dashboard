-- Assign a member to a staff member. Run in the SQL Editor.
--
-- Backs the Assigned queue: a member a coach has taken ownership of, so the
-- rest of the team can see who is on it and the daily queues can put your own
-- at the top. One row per member — reassigning replaces it.
--
-- Same access pattern as member_snoozes: any signed-in staff member can read
-- and assign; a row records who assigned it and who to.
--
-- Creates one table. Deletes nothing. Safe to run more than once.

create table if not exists member_assignments (
  member_id         text primary key,
  member_name       text not null,
  assigned_to       uuid not null references auth.users(id) on delete cascade,
  assigned_to_name  text not null,
  assigned_by       uuid not null references auth.users(id) on delete cascade,
  assigned_by_name  text not null,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_member_assignments_assignee
  on member_assignments (assigned_to);

alter table member_assignments enable row level security;

drop policy if exists "authenticated read assignments" on member_assignments;
create policy "authenticated read assignments" on member_assignments
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated assign" on member_assignments;
create policy "authenticated assign" on member_assignments
  for insert with check (assigned_by = auth.uid());

drop policy if exists "authenticated reassign" on member_assignments;
create policy "authenticated reassign" on member_assignments
  for update using (auth.role() = 'authenticated') with check (assigned_by = auth.uid());

drop policy if exists "authenticated unassign" on member_assignments;
create policy "authenticated unassign" on member_assignments
  for delete using (auth.role() = 'authenticated');
