-- THE SYSTEM · Solo Leveling training app
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query).
-- Schema mirrors the SQLite version, tied to auth.users with RLS so users can
-- only read/write their own rows. Server code uses the SERVICE ROLE key which
-- bypasses RLS — these policies are a defense-in-depth for the anon key.

-- Profiles ---------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  hunter_name text not null,
  created_at timestamptz not null default now()
);

-- Hunter stats -----------------------------------------------------------
create table if not exists public.hunter_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  level int not null default 1,
  xp int not null default 0,
  rank text not null default 'E',
  str int not null default 10,
  agi int not null default 10,
  vit int not null default 10,
  int_ int not null default 10,
  per int not null default 10,
  stat_points int not null default 0,
  streak int not null default 0,
  last_quest_date date,
  shadows_collected int not null default 0,
  mana int not null default 100
);

-- Daily quests -----------------------------------------------------------
create table if not exists public.daily_quests (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_date date not null,
  quest_key text not null,
  label text not null,
  target int not null,
  progress int not null default 0,
  unit text,
  completed boolean not null default false,
  unique (user_id, quest_date, quest_key)
);
create index if not exists idx_dq_user_date on public.daily_quests(user_id, quest_date);

-- Workout logs -----------------------------------------------------------
create table if not exists public.workout_logs (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  session_key text not null,
  exercise_key text not null,
  set_index int not null,
  weight numeric,
  reps int,
  completed_at timestamptz not null default now()
);
create index if not exists idx_wl_user_date on public.workout_logs(user_id, session_date);
create index if not exists idx_wl_user_ex on public.workout_logs(user_id, exercise_key);

-- Achievements -----------------------------------------------------------
create table if not exists public.achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_key)
);

-- Power-ups --------------------------------------------------------------
create table if not exists public.power_ups (
  user_id uuid not null references auth.users(id) on delete cascade,
  power_up_key text not null,
  quantity int not null default 0,
  primary key (user_id, power_up_key)
);

-- Active buffs -----------------------------------------------------------
create table if not exists public.active_buffs (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  buff_key text not null,
  expires_at timestamptz not null
);
create index if not exists idx_ab_user on public.active_buffs(user_id);

-- Notifications ----------------------------------------------------------
create table if not exists public.notifications (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  created_at timestamptz not null default now(),
  read boolean not null default false
);
create index if not exists idx_n_user on public.notifications(user_id, id desc);

-- Auto-create profile + hunter_stats whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, hunter_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'hunter_name', 'Hunter'));
  insert into public.hunter_stats (user_id) values (new.id);
  insert into public.achievements (user_id, achievement_key) values (new.id, 'awakening')
  on conflict do nothing;
  insert into public.notifications (user_id, kind, title, body) values
    (new.id, 'achievement', '[ ACHIEVEMENT UNLOCKED ]  The Awakening',
     'You have become an awakened Hunter.');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security -----------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.hunter_stats   enable row level security;
alter table public.daily_quests   enable row level security;
alter table public.workout_logs   enable row level security;
alter table public.achievements   enable row level security;
alter table public.power_ups      enable row level security;
alter table public.active_buffs   enable row level security;
alter table public.notifications  enable row level security;

-- Read-own policies
do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles','hunter_stats','daily_quests','workout_logs',
    'achievements','power_ups','active_buffs','notifications'
  ])
  loop
    execute format('drop policy if exists "own_select_%1$s" on public.%1$s;', t);
    if t = 'profiles' then
      execute format(
        'create policy "own_select_%1$s" on public.%1$s for select using (auth.uid() = id);', t);
    else
      execute format(
        'create policy "own_select_%1$s" on public.%1$s for select using (auth.uid() = user_id);', t);
    end if;
  end loop;
end$$;
