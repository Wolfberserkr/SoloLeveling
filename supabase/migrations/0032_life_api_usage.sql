-- ═══════════════════════════════════════════════════════════════════════════
-- 0032_life_api_usage.sql — what the Telegram chat costs on the Claude API key.
--
-- life-bot records one row per owner message it answers with Claude: the
-- tokens Claude reported and the cost at list price (micro-dollars, so sums
-- stay exact). life_api_usage_summary() is the one place that turns it into
-- "yesterday / month to date / budget"; the briefing (routine and fallback)
-- and the budget nudge all call it.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.life_api_usage (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  at            timestamptz not null default now(),
  model         text not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens  integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd_micros    bigint not null default 0
);
create index on public.life_api_usage (user_id, at desc);
alter table public.life_api_usage enable row level security;
create policy life_api_usage_own_select on public.life_api_usage for select using (auth.uid() = user_id);
grant select on public.life_api_usage to authenticated;

-- Yesterday and month-to-date in the owner's timezone, plus their monthly
-- budget (prefs.apiMonthlyBudgetUsd, default $10).
create or replace function public.life_api_usage_summary(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select coalesce(nullif(timezone, ''), 'America/Aruba') as tz,
           coalesce((prefs->>'apiMonthlyBudgetUsd')::numeric, 10) as budget
    from life_profile where user_id = p_user
  ), b as (
    select tz, budget,
           (date_trunc('day', now() at time zone tz) - interval '1 day') at time zone tz as y_start,
           date_trunc('day', now() at time zone tz) at time zone tz as t_start,
           date_trunc('month', now() at time zone tz) at time zone tz as m_start
    from p
  )
  select jsonb_build_object(
    'yesterdayMsgs', count(*) filter (where u.at >= b.y_start and u.at < b.t_start),
    'yesterdayUsd',  round(coalesce(sum(u.cost_usd_micros) filter (where u.at >= b.y_start and u.at < b.t_start), 0) / 1e6, 2),
    'monthMsgs',     count(*) filter (where u.at >= b.m_start),
    'monthUsd',      round(coalesce(sum(u.cost_usd_micros) filter (where u.at >= b.m_start), 0) / 1e6, 2),
    'budgetUsd',     max(b.budget),
    'month',         to_char(now() at time zone max(b.tz), 'Mon'))
  from b left join life_api_usage u on u.user_id = p_user and u.at >= least(b.y_start, b.m_start)
$$;
-- Service role only (bot, tick, routine): it takes any user id, so signed-in
-- users must not be able to call it for someone else.
revoke all on function public.life_api_usage_summary(uuid) from public, anon, authenticated;
