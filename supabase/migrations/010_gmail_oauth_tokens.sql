-- Business inbox OAuth token — the Yard's Workspace disables Gmail app
-- passwords, so the business scope authenticates via Google OAuth instead
-- of the app-password path used for personal (see src/lib/email/imap.ts).
-- Run this in Supabase SQL Editor.

create table if not exists gmail_oauth_tokens (
  scope text primary key check (scope in ('personal', 'business')),
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table gmail_oauth_tokens enable row level security;
-- Read/write via the service-role admin client only (server-side). No public policy.
