-- Adds the raw (trimmed) fetched email list to agent_briefs, so the home
-- dashboard's Inbox tile can show real, clickable emails alongside the AI
-- summary/tasks — not just the AI-derived output.
-- Run this in Supabase SQL Editor.

alter table agent_briefs add column if not exists emails jsonb not null default '[]';
