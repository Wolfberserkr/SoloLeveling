-- ═══════════════════════════════════════════════════════════════════════════
-- 04_habits_seed.sql — run ONCE by hand in the Supabase SQL editor, after the
-- 0037 migration. Seeds the six Habits tasks for the owner (the life_profile
-- row with a Telegram chat). Idempotent: a habit that already has an open
-- task with the same title is skipped. Jarvis pushes them to the Google
-- "Habits" list and sets the anchored reminders on its next tick.
--
-- Recurrence weekdays: 0 = Sunday … 6 = Saturday (same as parseRecur and
-- Postgres extract(dow)). "today" is the America/Aruba date.
-- ═══════════════════════════════════════════════════════════════════════════
with owner as (
  select user_id from public.life_profile where telegram_chat_id is not null order by updated_at limit 1
), today as (
  select (now() at time zone 'America/Aruba')::date as d
), habits(title, recur, dows, anchor, offset_min) as (
  values
    ('Morning routine: full bottle of water, move, read 10 pages, set two priorities', 'daily', null::int[], 'wake', 15),
    ('Evening shutdown: brain dump, open loops, 3 gratitudes, plan tomorrow, bedtime alarm', 'daily', null::int[], 'winddown', 0),
    ('Call or visit family', 'weekly:0', array[0], null, null),
    ('Message someone and check in', 'weekly:1,2,4', array[1,2,4], null, null),
    ('Quality time with my wife, no phones', 'weekly:1,2,3,4,5,6', array[1,2,3,4,5,6], null, null),
    ('Plan a date night', 'every:14d', null::int[], null, null)
)
insert into public.life_tasks (user_id, title, list, area, recur, due_on, remind_anchor, remind_offset_min)
select o.user_id, h.title, 'Habits', 'personal', h.recur,
       -- first matching local date on or after today (daily / every:14d start today)
       case when h.dows is null then t.d
            else (select t.d + g from generate_series(0, 6) g
                  where extract(dow from t.d + g)::int = any (h.dows) order by g limit 1) end,
       h.anchor, h.offset_min
from owner o cross join today t cross join habits h
where not exists (
  select 1 from public.life_tasks x
  where x.user_id = o.user_id and x.title = h.title and x.done_at is null
);
