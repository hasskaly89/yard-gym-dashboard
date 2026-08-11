-- Retention Notes — running comment thread per client (Phase 2)
-- Pairs with the member_contacts log (002) to power the Retention Logs report.
-- Run this in Supabase SQL Editor.

create table if not exists member_notes (
  id uuid primary key default gen_random_uuid(),
  member_id text not null,
  member_name text not null,
  note text not null,
  author_id uuid not null references auth.users(id),
  author_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_member_notes_member
  on member_notes(member_id, created_at desc);
create index if not exists idx_member_notes_recent
  on member_notes(created_at desc);

alter table member_notes enable row level security;

drop policy if exists "authenticated read notes" on member_notes;
create policy "authenticated read notes" on member_notes
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated insert notes" on member_notes;
create policy "authenticated insert notes" on member_notes
  for insert with check (auth.role() = 'authenticated' and author_id = auth.uid());

-- Authors can delete their own notes within a 10-minute grace window (typo fixes).
drop policy if exists "authenticated delete own recent notes" on member_notes;
create policy "authenticated delete own recent notes" on member_notes
  for delete using (
    auth.role() = 'authenticated'
    and author_id = auth.uid()
    and created_at > now() - interval '10 minutes'
  );
