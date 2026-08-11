-- User profiles + per-page access control
-- Run this in Supabase SQL Editor.
--
-- Each dashboard user gets a profile with a role (admin/staff) and an
-- allowed_pages list. Admins see everything; staff see only allowed_pages.
-- Super-admins are set via the SUPER_ADMIN_EMAILS env var (always admin),
-- so the owner can never be locked out by a bad DB edit.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  allowed_pages text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- A user may read their own profile (used by the proxy + layout). All writes
-- go through the service-role admin client in server actions, never the client.
drop policy if exists "read own profile" on profiles;
create policy "read own profile" on profiles
  for select using (auth.uid() = id);

-- Seed a profile row for every existing auth user (idempotent). New users get
-- a row lazily on first load.
insert into profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;
