-- ═══════════════════════════════════════════════════════════════════════════
-- 0004_dungeons.sql — PHASE 3: gym dungeons, boss fights, body metrics
-- All three tables are Tier B: clients SELECT own rows; the `game` edge
-- function (service role) does every write. Grants are explicit because
-- this project's schema defaults give authenticated nothing (see 0003).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── dungeon_progress — one row per user: campaign position ─────────────────
create table public.dungeon_progress (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  phase              int not null default 1,
  sessions_completed int not null default 0,  -- runs inside the current phase
  cycles_cleared     int not null default 0,  -- bosses defeated (raises daily targets)
  last_boss_attempt  date,
  updated_at         timestamptz not null default now()
);

alter table public.dungeon_progress enable row level security;
create policy "dungeon_progress_select_own" on public.dungeon_progress
  for select using (auth.uid() = user_id);

-- ── gym_sessions — one dungeon run per local day ────────────────────────────
create table public.gym_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  phase      int not null,
  notes      text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create index gym_sessions_user_date on public.gym_sessions (user_id, local_date);

alter table public.gym_sessions enable row level security;
create policy "gym_sessions_select_own" on public.gym_sessions
  for select using (auth.uid() = user_id);

-- ── body_metrics — one entry per local day, all fields optional ─────────────
create table public.body_metrics (
  user_id      uuid not null references auth.users(id) on delete cascade,
  local_date   date not null,
  weight_kg    numeric(5,2) check (weight_kg > 20 and weight_kg < 400),
  body_fat_pct numeric(4,1) check (body_fat_pct > 1 and body_fat_pct < 75),
  waist_cm     numeric(5,1) check (waist_cm > 30 and waist_cm < 250),
  chest_cm     numeric(5,1) check (chest_cm > 30 and chest_cm < 250),
  arm_cm       numeric(4,1) check (arm_cm > 10 and arm_cm < 80),
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  primary key (user_id, local_date)
);

alter table public.body_metrics enable row level security;
create policy "body_metrics_select_own" on public.body_metrics
  for select using (auth.uid() = user_id);

-- Clients read their own rows; all writes go through the edge function.
grant select on public.dungeon_progress, public.gym_sessions, public.body_metrics
to authenticated;

-- ── New players start at the dungeon entrance; existing players too ─────────
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
  insert into dungeon_progress (user_id) values (new.id);

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

insert into public.dungeon_progress (user_id)
select user_id from public.profiles
on conflict (user_id) do nothing;
