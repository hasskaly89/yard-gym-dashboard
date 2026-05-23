-- Retention Action Loop Schema (Phase 1)
-- Run this in Supabase SQL Editor

create table if not exists member_contacts (
  id uuid primary key default gen_random_uuid(),
  member_id text not null,
  member_name text not null,
  band text not null check (band in ('STABLE','SLOWING','SLIDING','STOPPED')),
  contacted_at timestamptz not null default now(),
  contacted_by uuid not null references auth.users(id),
  contacted_by_name text not null,
  channel text check (channel in ('sms','call','in_person','ghl','other') or channel is null),
  outcome text,
  created_at timestamptz not null default now()
);

create index if not exists idx_member_contacts_member
  on member_contacts(member_id, contacted_at desc);
create index if not exists idx_member_contacts_recent
  on member_contacts(contacted_at desc);
create index if not exists idx_member_contacts_by_user
  on member_contacts(contacted_by, contacted_at desc);

create table if not exists member_snoozes (
  id uuid primary key default gen_random_uuid(),
  member_id text not null unique,
  snoozed_until timestamptz not null,
  snoozed_by uuid not null references auth.users(id),
  snoozed_by_name text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_member_snoozes_until
  on member_snoozes(snoozed_until);

alter table member_contacts enable row level security;
alter table member_snoozes enable row level security;

drop policy if exists "authenticated read contacts" on member_contacts;
create policy "authenticated read contacts" on member_contacts
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated insert contacts" on member_contacts;
create policy "authenticated insert contacts" on member_contacts
  for insert with check (auth.role() = 'authenticated' and contacted_by = auth.uid());

drop policy if exists "authenticated delete own recent contacts" on member_contacts;
create policy "authenticated delete own recent contacts" on member_contacts
  for delete using (
    auth.role() = 'authenticated'
    and contacted_by = auth.uid()
    and created_at > now() - interval '5 minutes'
  );

drop policy if exists "authenticated read snoozes" on member_snoozes;
create policy "authenticated read snoozes" on member_snoozes
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated insert snoozes" on member_snoozes;
create policy "authenticated insert snoozes" on member_snoozes
  for insert with check (auth.role() = 'authenticated' and snoozed_by = auth.uid());

drop policy if exists "authenticated update snoozes" on member_snoozes;
create policy "authenticated update snoozes" on member_snoozes
  for update using (auth.role() = 'authenticated');
