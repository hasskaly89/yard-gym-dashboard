-- Health scores + AI retention summaries
-- Run this in Supabase SQL Editor (as part of the deploy).
--
-- Adds the persisted per-member health score (0-100, low = high risk), its risk
-- band, and the AI-generated "why + suggested action" summary. Populated nightly
-- by /api/milestones/cron. All derived from already-synced data — no MindBody cost.

alter table members add column if not exists health_score smallint;
alter table members add column if not exists risk_band text
  check (risk_band in ('healthy','medium','high') or risk_band is null);
alter table members add column if not exists score_updated_at timestamptz;
alter table members add column if not exists ai_summary text;
alter table members add column if not exists ai_summary_at timestamptz;

-- Board sorts by risk (lowest score first) among paid members.
create index if not exists idx_members_risk
  on members(has_paid_membership, health_score)
  where status = 'active';
