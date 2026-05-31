-- Flags members currently on a paid membership tier (Foundation T1/T2,
-- TYG Membership, VIP, Black Friday Weekly). Set by the nightly cron.

alter table members
  add column if not exists has_paid_membership boolean not null default false;

create index if not exists idx_members_paid
  on members(has_paid_membership)
  where has_paid_membership = true;
