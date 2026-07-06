-- ═══════════════════════════════════════════════════════════════════════════
-- 0025_reset_tracker.sql — D's "Reset" home-training portal.
--
-- A second, self-contained UI (role-routed by a client-side account allowlist)
-- with its own tables. Unlike the RPG's Tier-B tables (server-only writes, an
-- anti-cheat boundary), this is a personal workout tracker with no rewards to
-- protect — so the OWNER reads AND writes their own rows directly via RLS. No
-- edge function is involved. Mirrors the DWorkout data model.
-- ═══════════════════════════════════════════════════════════════════════════

-- One row per user: program week, per-day set progress, swaps, saved videos.
create table public.reset_app_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  week       int not null default 1 check (week between 1 and 12),
  progress   jsonb not null default '{}'::jsonb,
  swaps      jsonb not null default '{}'::jsonb,
  videos     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- A finished workout: a snapshot of the day and every exercise's logged detail.
create table public.reset_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  day_id       text not null,
  day_name     text not null,
  completed_at timestamptz not null default now(),
  done_sets    int not null default 0,
  total_sets   int not null default 0,
  exercises    jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);
create index reset_sessions_user_date on public.reset_sessions (user_id, completed_at desc);

-- Every rep/weight entry, for personal-record derivation.
create table public.reset_exercise_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  exercise_id text not null,
  reps        text,
  weight      numeric(6,2),
  logged_at   timestamptz not null default now()
);
create index reset_exercise_logs_user on public.reset_exercise_logs (user_id, exercise_id);

-- Weekly weigh-in: one per calendar day.
create table public.reset_weights (
  user_id     uuid not null references auth.users(id) on delete cascade,
  recorded_on date not null,
  kg          numeric(5,1) not null check (kg between 20 and 400),
  updated_at  timestamptz not null default now(),
  primary key (user_id, recorded_on)
);

-- Daily nutrition check-in: one per calendar day.
create table public.reset_nutrition (
  user_id     uuid not null references auth.users(id) on delete cascade,
  recorded_on date not null,
  rating      text not null check (rating in ('great','okay','struggled','skipped')),
  note        text,
  updated_at  timestamptz not null default now(),
  primary key (user_id, recorded_on)
);

-- ── RLS: each user owns their own rows for read AND write ────────────────────
-- (Personal tracker — no server-authoritative boundary. The check on both
--  USING and WITH CHECK stops anyone writing rows under another user_id.)
do $$
declare t text;
begin
  foreach t in array array[
    'reset_app_state','reset_sessions','reset_exercise_logs','reset_weights','reset_nutrition'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "%1$s_own_select" on public.%1$I
      for select using (auth.uid() = user_id)$p$, t);
    execute format($p$create policy "%1$s_own_insert" on public.%1$I
      for insert with check (auth.uid() = user_id)$p$, t);
    execute format($p$create policy "%1$s_own_update" on public.%1$I
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$, t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;
