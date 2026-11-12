-- Tasks become Google Tasks: lists, reminders, recurrence, and the link to
-- the Google Tasks item (kept in sync by life-bot through an Apps Script bridge).
alter table public.life_tasks
  add column if not exists list          text not null default 'Personal',
  add column if not exists notes         text,
  add column if not exists recur         text,         -- daily | weekly:0,3 | monthly:1 | every:14d
  add column if not exists remind_at     timestamptz,  -- Telegram reminder
  add column if not exists reminded_at   timestamptz,
  add column if not exists gtask_id      text,
  add column if not exists gtask_list    text,
  add column if not exists gtask_updated timestamptz,
  add column if not exists source        text not null default 'jarvis',
  add column if not exists next_spawned  boolean not null default false,  -- recurring: next one created
  add column if not exists updated_at    timestamptz not null default now();

update public.life_tasks set list = case area
  when 'grocery' then 'Groceries' when 'errand' then 'Errands' when 'household' then 'Household'
  when 'work' then 'Work' else 'Personal' end;

create unique index if not exists life_tasks_gtask on public.life_tasks (user_id, gtask_id) where gtask_id is not null;
create index if not exists life_tasks_remind on public.life_tasks (remind_at) where done_at is null and reminded_at is null;
