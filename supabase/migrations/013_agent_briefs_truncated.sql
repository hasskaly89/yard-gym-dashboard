-- Records that a brief's task list is INCOMPLETE — the model's response was cut
-- off at max_tokens and only partially recovered, or the list was capped at
-- MAX_TASKS. Without this the dashboard renders a partial list identically to a
-- complete one, so a silently-shortened brief looks trustworthy. Failing loud
-- beats failing soft here: the whole point of the pre-scoring work is that the
-- priorities can be trusted.
-- Run this in Supabase SQL Editor.

alter table agent_briefs add column if not exists truncated boolean not null default false;
