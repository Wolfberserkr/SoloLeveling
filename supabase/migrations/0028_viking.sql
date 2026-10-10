-- ═══════════════════════════════════════════════════════════════════════════
-- 0028_viking.sql — Project Viking, the 52-week training plan that replaces
-- the Solo Leveling RPG on the System side of the site.
--
-- A personal tracker (no rewards to protect), so like the Reset portal the
-- OWNER reads and writes their own rows directly under RLS — no edge
-- function. The app is a small document store: one row per (collection,
-- doc id), the document itself in `data`.
--
--   coll        doc_id             data
--   settings    settings           start date/weight, phase override, kcal adjust
--   weights     YYYY-MM-DD         { date, kg }
--   waist       YYYY-MM-DD         { date, cm }
--   nutrition   YYYY-MM-DD         { date, items, extraKcal, extraProtein, water }
--   recovery    YYYY-MM-DD         { date, sleep, steps, supps }
--   workouts    YYYY-MM-DD_<sess>  { date, session, week, phase, deload, entries }
--   rides       YYYY-MM-DD_<id>    { date, type, minutes, hr }
--
-- The old RPG tables are left in place untouched (no data is dropped).
-- ═══════════════════════════════════════════════════════════════════════════

create table public.viking_docs (
  user_id    uuid not null references auth.users(id) on delete cascade,
  coll       text not null check (coll in
               ('settings','weights','waist','nutrition','recovery','workouts','rides')),
  doc_id     text not null check (char_length(doc_id) between 1 and 80),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, coll, doc_id)
);

alter table public.viking_docs enable row level security;
create policy "viking_docs_own_select" on public.viking_docs
  for select using (auth.uid() = user_id);
create policy "viking_docs_own_insert" on public.viking_docs
  for insert with check (auth.uid() = user_id);
create policy "viking_docs_own_update" on public.viking_docs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "viking_docs_own_delete" on public.viking_docs
  for delete using (auth.uid() = user_id);
grant select, insert, update, delete on public.viking_docs to authenticated;

-- The Solo Leveling heartbeat (Daily Quest reminders, System Events) is gone
-- with the RPG; stop its hourly pg_cron job so it no longer sends pushes.
-- Ascend's own reminder job is separate and keeps running.
do $$
begin
  -- Nested + dynamic so the migration still runs where pg_cron isn't installed.
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'cron' and c.relname = 'job') then
      execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'system-heartbeat'$q$;
    end if;
  end if;
end $$;
