-- Milestone Automation Schema
-- Run this in Supabase SQL Editor

-- Extend members table with milestone tracking fields
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS membership_start_date date,
  ADD COLUMN IF NOT EXISTS total_visit_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_visit_date timestamptz,
  ADD COLUMN IF NOT EXISTS last_milestone_visit integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_milestone_anniversary text,
  ADD COLUMN IF NOT EXISTS ghl_contact_id text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS inactivity_notified_days integer DEFAULT 0;

-- Milestone log table
CREATE TABLE IF NOT EXISTS milestone_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mindbody_client_id text NOT NULL,
  milestone_type text NOT NULL,       -- birthday, session, anniversary, inactivity
  milestone_value text NOT NULL,       -- e.g. "100 sessions", "1 year", "14 days"
  triggered_at timestamptz DEFAULT now(),
  ghl_notified boolean DEFAULT false,
  staff_notified boolean DEFAULT false
);

-- Index for fast lookups by client + type + date
CREATE INDEX IF NOT EXISTS idx_milestone_log_client
  ON milestone_log (mindbody_client_id, milestone_type, triggered_at DESC);

-- Index for dashboard queries (recent milestones)
CREATE INDEX IF NOT EXISTS idx_milestone_log_triggered
  ON milestone_log (triggered_at DESC);

-- Index for inactivity scanning
CREATE INDEX IF NOT EXISTS idx_members_last_visit
  ON members (last_visit_date)
  WHERE status = 'active';

-- Index for birthday scanning
CREATE INDEX IF NOT EXISTS idx_members_birth_date
  ON members (birth_date)
  WHERE status = 'active' AND birth_date IS NOT NULL;
