-- ═══════════════════════════════════════════════════════════════════════════
-- 0024_focus_runs.sql — FEATURE F2: the Instant Dungeon (focus timer).
--
-- A run commits the Player to 25/50/90 minutes of focused work on 1–3 "mobs"
-- (subtasks). started_at / ends_at are stamped server-side; completion is
-- rejected before ends_at, so a run cannot be forged — the wall-clock has to
-- actually pass. One active run at a time (partial unique index). Clearing
-- pays cap-eligible XP + INT/WIS/DIS; abandoning collapses it for nothing.
--
-- Tier B: clients SELECT their own rows; only the `game` edge function writes.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.focus_runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  local_date   date not null,
  duration_min int not null check (duration_min in (25, 50, 90)),
  mobs         jsonb not null default '[]'::jsonb,
  started_at   timestamptz not null default now(),
  ends_at      timestamptz not null,
  status       text not null default 'active'
                 check (status in ('active', 'completed', 'collapsed')),
  xp_awarded   int not null default 0,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

-- At most one active dungeon per player at a time.
create unique index focus_runs_one_active
  on public.focus_runs (user_id) where status = 'active';

-- Keys spent today = active + completed runs (collapsed runs refund the key).
create index focus_runs_user_date on public.focus_runs (user_id, local_date);

alter table public.focus_runs enable row level security;
create policy "focus_runs_select_own" on public.focus_runs
  for select using (auth.uid() = user_id);

grant select on public.focus_runs to authenticated;
