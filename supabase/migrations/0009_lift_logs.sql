-- ═══════════════════════════════════════════════════════════════════════════
-- 0009_lift_logs.sql — top-set weight per exercise per day
-- Tier B: clients SELECT own rows; the `game` edge function writes.
-- One row per exercise per local day — re-logging refines that day's entry.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.lift_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  exercise   text not null,
  weight_kg  numeric(6,2) not null check (weight_kg > 0 and weight_kg <= 1000),
  reps       int not null default 0 check (reps >= 0 and reps <= 100),
  created_at timestamptz not null default now(),
  unique (user_id, local_date, exercise)
);

create index lift_logs_user_exercise on public.lift_logs (user_id, exercise, weight_kg desc);

alter table public.lift_logs enable row level security;
create policy "lift_logs_select_own" on public.lift_logs
  for select using (auth.uid() = user_id);

grant select on public.lift_logs to authenticated;
