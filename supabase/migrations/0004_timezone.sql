-- Per-user timezone so date rollover happens at midnight in the user's
-- local time, not midnight UTC. Defaults to UTC; the dashboard auto-syncs
-- the detected browser timezone on first load.
alter table public.profiles
  add column if not exists timezone text not null default 'UTC';
