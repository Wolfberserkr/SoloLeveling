-- ═══════════════════════════════════════════════════════════════════════════
-- 0037_viking_garmin.sql — Garmin-first training for Project Viking.
--
-- Additive and idempotent. Two new document collections in viking_docs, plus
-- habit-reminder columns on life_tasks.
--
--   coll       doc_id                                        data
--   garmin_in  <activityId>                                  imported Garmin activity; `processedAt`
--                                                            is null until the tick has handled it
--   plan       current | state | garmin | weekly | <date>    Jarvis's plan documents: the current plan,
--              | decision-<id>                               engine state, the Garmin workouts Jarvis
--                                                            created (plan/garmin), the weekly review,
--                                                            per-day plans and logged decisions
--
-- life_tasks gains the habit-reminder fields: remind_anchor ('wake' or
-- 'winddown'), remind_offset_min, remind_auto_at and skipped_at.
--
-- RLS is unchanged: the owner-only policies from 0028 cover every collection.
-- The Ascend reminders cron job is NOT touched here.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.viking_docs drop constraint if exists viking_docs_coll_check;
alter table public.viking_docs add constraint viking_docs_coll_check check (coll in
  ('settings','weights','waist','nutrition','recovery','workouts','rides','cycle','benchmarks',
   'garmin_in','plan'));

alter table public.life_tasks
  add column if not exists remind_anchor text check (remind_anchor in ('wake','winddown')),
  add column if not exists remind_offset_min int not null default 0,
  add column if not exists remind_auto_at timestamptz,
  add column if not exists skipped_at timestamptz;

create index if not exists viking_docs_garmin_in_open
  on public.viking_docs (user_id)
  where coll = 'garmin_in' and (data->>'processedAt') is null;
