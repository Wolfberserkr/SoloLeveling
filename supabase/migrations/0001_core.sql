-- ═══════════════════════════════════════════════════════════════════════════
-- 0001_core.sql — SYSTEM CORE
-- Identity, stats, XP ledger, daily training quest, system message feed.
--
-- RLS tiers:
--   Tier A (client-writable): profiles (limited columns)
--   Tier B (server-authoritative): xp_ledger, training_quests, training_totals,
--          system_messages — clients may SELECT own rows; ONLY the service
--          role (edge functions) writes. This is the anti-cheat boundary.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  display_name       text not null default 'Player',
  timezone           text not null default 'Europe/Amsterdam',
  journey_started_at date not null default (now() at time zone 'utc')::date,
  level              int  not null default 1,
  xp_total           bigint not null default 0,
  rank               text not null default 'E',
  class              text,
  mana               int  not null default 100,
  mana_max           int  not null default 100,
  mana_potions       int  not null default 0,
  essence_stones     int  not null default 0,
  equipped_title     text,
  fatigue            int  not null default 0,
  last_daily_reset   date,
  created_at         timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);

-- Clients may only touch benign identity columns; game columns are revoked.
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke update on public.profiles from authenticated;
grant update (display_name, timezone) on public.profiles to authenticated;

-- ── stats (9 rows per user) ─────────────────────────────────────────────────
create table public.stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  stat    text not null check (stat in ('STR','END','AGI','INT','WIS','STA','WIL','DIS','CHA')),
  value   numeric(8,2) not null default 10,
  primary key (user_id, stat)
);

alter table public.stats enable row level security;
create policy "stats_select_own" on public.stats
  for select using (auth.uid() = user_id);

-- ── xp_ledger (Tier B) ──────────────────────────────────────────────────────
-- `amount` = raw award; `credited` = what actually counted after the daily cap.
create table public.xp_ledger (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  amount       int  not null,
  credited     int  not null,
  source       text not null,
  source_ref   uuid,
  cap_eligible boolean not null default true,
  local_date   date not null,
  created_at   timestamptz not null default now()
);

create index xp_ledger_user_date on public.xp_ledger (user_id, local_date);

alter table public.xp_ledger enable row level security;
create policy "xp_ledger_select_own" on public.xp_ledger
  for select using (auth.uid() = user_id);

-- ── training_quests (Tier B) ────────────────────────────────────────────────
create table public.training_quests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  local_date      date not null,
  variant         text not null default 'standard'
                  check (variant in ('standard','endurance','strength','speed','recovery')),
  pushups_target  int not null,
  situps_target   int not null,
  squats_target   int not null,
  run_km_target   numeric(6,2) not null,
  pushups_done    int not null default 0,
  situps_done     int not null default 0,
  squats_done     int not null default 0,
  run_km_done     numeric(6,2) not null default 0,
  load_modifier   numeric(4,2) not null default 1.0,
  status          text not null default 'pending'
                  check (status in ('pending','completed','failed','expired')),
  perfect_clear   boolean not null default false,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (user_id, local_date)
);

alter table public.training_quests enable row level security;
create policy "training_quests_select_own" on public.training_quests
  for select using (auth.uid() = user_id);

-- ── training_totals (Tier B) — cumulative counters & streaks ────────────────
create table public.training_totals (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  total_pushups       bigint not null default 0,
  total_situps        bigint not null default 0,
  total_squats        bigint not null default 0,
  total_run_km        numeric(10,2) not null default 0,
  days_completed      int not null default 0,
  current_streak      int not null default 0,
  best_streak         int not null default 0,
  last_completed_date date
);

alter table public.training_totals enable row level security;
create policy "training_totals_select_own" on public.training_totals
  for select using (auth.uid() = user_id);

-- ── system_messages — the in-app [SYSTEM] feed ──────────────────────────────
create table public.system_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null default '',
  payload    jsonb not null default '{}'::jsonb,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index system_messages_user_created on public.system_messages (user_id, created_at desc);

alter table public.system_messages enable row level security;
create policy "system_messages_select_own" on public.system_messages
  for select using (auth.uid() = user_id);
-- Clients may only flip the read flag.
create policy "system_messages_update_own" on public.system_messages
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke update on public.system_messages from authenticated;
grant update (read) on public.system_messages to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- award_xp — the ONLY path that grants XP. Atomic: ledger + profile + level.
-- Mirrors _shared/game/xpCurve.ts: totalXp(L) = round(425 * (L^1.55 - 1)).
-- Daily cap of 300 applies to cap-eligible sources, measured in credited XP.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.xp_total_for_level(p_level int)
returns bigint
language sql immutable
as $$
  select case when p_level <= 1 then 0
         else round(425 * (power(least(p_level, 100), 1.55) - 1))::bigint end;
$$;

create or replace function public.level_from_xp(p_xp bigint)
returns int
language plpgsql immutable
as $$
declare
  l int := 1;
begin
  while l < 100 and p_xp >= public.xp_total_for_level(l + 1) loop
    l := l + 1;
  end loop;
  return l;
end;
$$;

create or replace function public.award_xp(
  p_user uuid,
  p_amount int,
  p_source text,
  p_source_ref uuid,
  p_cap_eligible boolean,
  p_local_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spent_today int;
  v_credited int := p_amount;
  v_old_level int;
  v_new_level int;
  v_new_total bigint;
begin
  if p_amount < 0 then
    raise exception 'negative XP award';
  end if;

  if p_cap_eligible then
    select coalesce(sum(credited), 0) into v_spent_today
    from xp_ledger
    where user_id = p_user and local_date = p_local_date and cap_eligible;
    v_credited := greatest(0, least(p_amount, 300 - v_spent_today));
  end if;

  insert into xp_ledger (user_id, amount, credited, source, source_ref, cap_eligible, local_date)
  values (p_user, p_amount, v_credited, p_source, p_source_ref, p_cap_eligible, p_local_date);

  select level into v_old_level from profiles where user_id = p_user for update;

  update profiles
  set xp_total = xp_total + v_credited
  where user_id = p_user
  returning xp_total into v_new_total;

  v_new_level := public.level_from_xp(v_new_total);

  if v_new_level <> v_old_level then
    update profiles set level = v_new_level where user_id = p_user;
  end if;

  return jsonb_build_object(
    'amount', p_amount,
    'credited', v_credited,
    'capped', v_credited < p_amount,
    'xp_total', v_new_total,
    'old_level', v_old_level,
    'new_level', v_new_level,
    'leveled_up', v_new_level > v_old_level
  );
end;
$$;

revoke execute on function public.award_xp from public, anon, authenticated;
-- Revoking from PUBLIC also strips service_role's implicit grant; edge
-- functions call this via RPC with the service-role key, so restore it.
grant execute on function public.award_xp to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- New player initialization: profile + 9 stats + awakening message.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'Player'));

  insert into stats (user_id, stat)
  select new.id, s from unnest(array['STR','END','AGI','INT','WIS','STA','WIL','DIS','CHA']) as s;

  insert into training_totals (user_id) values (new.id);

  insert into system_messages (user_id, kind, title, body)
  values (
    new.id,
    'awakening',
    'You have acquired the qualifications to be a Player.',
    'The System has bound itself to you. Your transformation begins now. Complete your Daily Training Quest to earn experience. There are no shortcuts.'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
