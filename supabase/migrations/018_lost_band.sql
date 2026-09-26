-- Add the 'lost' band. Run in the SQL Editor BEFORE deploying the code that
-- writes it — otherwise the nightly score run fails the check constraint for
-- every member 30+ days absent (23 of 207 on 2026-09-25) and writes nothing.
--
-- 'lost' is an absence state, not a score band: 30+ days since the last visit.
-- Those members had been sitting in 'high' on a score of 0 — 14 of the 24
-- high-risk members had been gone 50–440 days — while the people still worth a
-- call that week (12–20 days away) were in medium or healthy. The band is also
-- now floored by absence the way the trend columns already are: 14+ days ⇒ at
-- least medium, 21+ ⇒ high, 30+ ⇒ lost. Scores are unchanged.
--
-- Safe to run more than once.

alter table members drop constraint if exists members_risk_band_check;
alter table members add constraint members_risk_band_check
  check (risk_band in ('healthy','medium','high','lost') or risk_band is null);

alter table member_score_snapshots drop constraint if exists member_score_snapshots_band_check;
alter table member_score_snapshots add constraint member_score_snapshots_band_check
  check (band in ('healthy','medium','high','lost'));

-- Relabel the 90 days of history already recorded, so the series does not
-- change meaning on the night this ships. The snapshot stores
-- days_since_last_visit, so the new rule can be applied exactly.
update member_score_snapshots set band = 'lost'
  where days_since_last_visit >= 30;   -- null = never visited: not lost, left as scored
update member_score_snapshots set band = 'high'
  where days_since_last_visit >= 21 and days_since_last_visit < 30 and band in ('healthy','medium');
update member_score_snapshots set band = 'medium'
  where days_since_last_visit >= 14 and days_since_last_visit < 21 and band = 'healthy';
