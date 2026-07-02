-- ═══════════════════════════════════════════════════════════════════════════
-- 0020_nutrition.sql — PHASE 11: the Fuel Protocol (nutrition intake)
--
-- One row per player per day: protein grams accumulate as they are logged,
-- the supplement stack is checked off, and the server marks `fueled` /
-- `stacked` exactly once when each threshold is crossed — those flags are
-- what gate the XP awards, so re-logging can never double-pay.
--
-- Tier B: clients SELECT their own rows; only the `game` edge function
-- writes (the anti-cheat boundary, same as training_quests).
--
-- profiles.protein_target_g is the player's personal daily target. It is the
-- fourth client-writable profiles column (after display_name, timezone,
-- reminder_hour): the whole protocol is self-reported, so letting the player
-- tune their own target adds no cheating surface the honor system doesn't
-- already have — the check constraint just keeps it plausible.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column protein_target_g int not null default 182
    check (protein_target_g between 60 and 400);

grant update (protein_target_g) on public.profiles to authenticated;

create table public.nutrition_logs (
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  protein_g  numeric(5,1) not null default 0,
  creatine   boolean not null default false,
  vitamins   boolean not null default false,
  target_g   int not null,                 -- target snapshot when first logged
  fueled     boolean not null default false, -- protein target met (XP paid)
  stacked    boolean not null default false, -- full stack taken (XP paid)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

alter table public.nutrition_logs enable row level security;
create policy "nutrition_logs_select_own" on public.nutrition_logs
  for select using (auth.uid() = user_id);

grant select on public.nutrition_logs to authenticated;
