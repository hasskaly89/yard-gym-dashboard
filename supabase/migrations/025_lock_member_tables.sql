-- Stop the public Supabase key, and any stranger who signs up, from reading
-- member data directly. The app already reads and writes these tables with the
-- service role after its own login check, except the retention log tables,
-- which the signed-in user's session still reads and writes.
--
-- Run this in the Supabase SQL editor. It does not delete or update rows.
-- Safe to run twice.
--
-- What was true when this was written (probed with the publishable key, no
-- row values inspected): every app table returned zero rows to that key, so
-- row level security is already on in production. Signup is still enabled
-- (`disable_signup: false`). Policies that say `auth.role() = 'authenticated'`
-- therefore let anyone who confirms an email read visits, notes, contacts and
-- memberships, bypassing the dashboard allowlist. This tightens that.

-- members and milestone_log were created outside the numbered migrations and
-- never had RLS in this repo. Service role only — no app code reads them with
-- the user's session.
do $$
declare
  t text;
begin
  foreach t in array array['members', 'milestone_log']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all privileges on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- These are written and read only through the service role. Drop the
-- "any logged-in Supabase user may select" policies. With RLS still enabled
-- and no replacement policy, anon and authenticated see nothing.
do $$
declare
  t text;
begin
  foreach t in array array[
    'member_visits',
    'member_memberships',
    'member_score_snapshots',
    'outbound_log',
    'contact_results'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all privileges on table public.%I from anon', t);
    end if;
  end loop;
end $$;

drop policy if exists "authenticated read visits" on public.member_visits;
drop policy if exists "authenticated read memberships" on public.member_memberships;
drop policy if exists "authenticated read snapshots" on public.member_score_snapshots;
drop policy if exists "authenticated read outbound" on public.outbound_log;
drop policy if exists "authenticated read results" on public.contact_results;

-- Retention logs are still read and written by the signed-in user's session
-- (server actions and /api/retention/*). Keep those operations, but require a
-- dashboard profile so a public signup cannot use them.
alter table public.member_contacts enable row level security;
revoke all privileges on table public.member_contacts from anon;

drop policy if exists "authenticated read contacts" on public.member_contacts;
drop policy if exists "dashboard read contacts" on public.member_contacts;
create policy "dashboard read contacts" on public.member_contacts
  for select using (exists (select 1 from public.profiles where id = auth.uid()));

drop policy if exists "authenticated insert contacts" on public.member_contacts;
drop policy if exists "dashboard insert contacts" on public.member_contacts;
create policy "dashboard insert contacts" on public.member_contacts
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid())
    and contacted_by = auth.uid()
  );

drop policy if exists "authenticated delete own recent contacts" on public.member_contacts;
drop policy if exists "dashboard delete own recent contacts" on public.member_contacts;
create policy "dashboard delete own recent contacts" on public.member_contacts
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid())
    and contacted_by = auth.uid()
    and created_at > now() - interval '5 minutes'
  );

alter table public.member_snoozes enable row level security;
revoke all privileges on table public.member_snoozes from anon;

drop policy if exists "authenticated read snoozes" on public.member_snoozes;
drop policy if exists "dashboard read snoozes" on public.member_snoozes;
create policy "dashboard read snoozes" on public.member_snoozes
  for select using (exists (select 1 from public.profiles where id = auth.uid()));

drop policy if exists "authenticated insert snoozes" on public.member_snoozes;
drop policy if exists "dashboard insert snoozes" on public.member_snoozes;
create policy "dashboard insert snoozes" on public.member_snoozes
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid())
    and snoozed_by = auth.uid()
  );

drop policy if exists "authenticated update snoozes" on public.member_snoozes;
drop policy if exists "dashboard update snoozes" on public.member_snoozes;
create policy "dashboard update snoozes" on public.member_snoozes
  for update using (exists (select 1 from public.profiles where id = auth.uid()));

alter table public.member_notes enable row level security;
revoke all privileges on table public.member_notes from anon;

drop policy if exists "authenticated read notes" on public.member_notes;
drop policy if exists "dashboard read notes" on public.member_notes;
create policy "dashboard read notes" on public.member_notes
  for select using (exists (select 1 from public.profiles where id = auth.uid()));

drop policy if exists "authenticated insert notes" on public.member_notes;
drop policy if exists "dashboard insert notes" on public.member_notes;
create policy "dashboard insert notes" on public.member_notes
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid())
    and author_id = auth.uid()
  );

drop policy if exists "authenticated delete own recent notes" on public.member_notes;
drop policy if exists "dashboard delete own recent notes" on public.member_notes;
create policy "dashboard delete own recent notes" on public.member_notes
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid())
    and author_id = auth.uid()
    and created_at > now() - interval '10 minutes'
  );

alter table public.member_assignments enable row level security;
revoke all privileges on table public.member_assignments from anon;

drop policy if exists "authenticated read assignments" on public.member_assignments;
drop policy if exists "dashboard read assignments" on public.member_assignments;
create policy "dashboard read assignments" on public.member_assignments
  for select using (exists (select 1 from public.profiles where id = auth.uid()));

drop policy if exists "authenticated assign" on public.member_assignments;
drop policy if exists "dashboard assign" on public.member_assignments;
create policy "dashboard assign" on public.member_assignments
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid())
    and assigned_by = auth.uid()
  );

drop policy if exists "authenticated reassign" on public.member_assignments;
drop policy if exists "dashboard reassign" on public.member_assignments;
create policy "dashboard reassign" on public.member_assignments
  for update using (exists (select 1 from public.profiles where id = auth.uid()))
  with check (
    exists (select 1 from public.profiles where id = auth.uid())
    and assigned_by = auth.uid()
  );

drop policy if exists "authenticated unassign" on public.member_assignments;
drop policy if exists "dashboard unassign" on public.member_assignments;
create policy "dashboard unassign" on public.member_assignments
  for delete using (exists (select 1 from public.profiles where id = auth.uid()));
