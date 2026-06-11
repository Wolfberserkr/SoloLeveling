-- ═══════════════════════════════════════════════════════════════════════════
-- 0002_daily_loop.sql — PHASE 2: mana economy + daily quest loop
-- Side quests (mind/character work, cost mana, pay XP) and sleep logs
-- (the regen side of the economy). Both Tier B: clients SELECT own rows
-- only; the `game` edge function (service role) does all writes.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── daily_quests — per-day side quests rolled by the System ────────────────
create table public.daily_quests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  local_date   date not null,
  quest_key    text not null,
  title        text not null,
  body         text not null default '',
  mana_cost    int  not null default 0,
  xp_reward    int  not null default 0,
  status       text not null default 'pending'
               check (status in ('pending','completed','expired')),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, local_date, quest_key)
);

create index daily_quests_user_date on public.daily_quests (user_id, local_date);

alter table public.daily_quests enable row level security;
create policy "daily_quests_select_own" on public.daily_quests
  for select using (auth.uid() = user_id);

-- ── sleep_logs — one row per local day; fuels mana regen ───────────────────
create table public.sleep_logs (
  user_id       uuid not null references auth.users(id) on delete cascade,
  local_date    date not null,
  hours         numeric(4,1) not null check (hours >= 0 and hours <= 24),
  mana_gained   int not null default 0,
  potion_earned boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (user_id, local_date)
);

alter table public.sleep_logs enable row level security;
create policy "sleep_logs_select_own" on public.sleep_logs
  for select using (auth.uid() = user_id);
