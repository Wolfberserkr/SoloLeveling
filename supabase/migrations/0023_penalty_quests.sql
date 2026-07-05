-- ═══════════════════════════════════════════════════════════════════════════
-- 0023_penalty_quests.sql — FEATURE F1: the Penalty Quest.
--
-- When a streak worth saving (>= 3) breaks and no shield covers it, the daily
-- reset issues a one-shot Penalty Quest for that day: the missed targets,
-- scaled up. Meeting every target restores the broken streak (it does not
-- increment it). Unresolved by midnight, the row expires and the break stands.
--
-- Tier B: clients SELECT their own rows; only the `game` edge function writes
-- (the anti-cheat boundary, same as training_quests).
-- ═══════════════════════════════════════════════════════════════════════════

create table public.penalty_quests (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  local_date        date not null,
  streak_to_restore int not null,               -- what the streak was before it broke
  pushups_target    int not null,
  situps_target     int not null,
  squats_target     int not null,
  run_km_target     numeric(5,2) not null,
  pushups_done      int not null default 0,
  situps_done       int not null default 0,
  squats_done       int not null default 0,
  run_km_done       numeric(5,2) not null default 0,
  status            text not null default 'pending'
                      check (status in ('pending', 'completed', 'expired')),
  created_at        timestamptz not null default now(),
  completed_at      timestamptz,
  unique (user_id, local_date)
);

alter table public.penalty_quests enable row level security;
create policy "penalty_quests_select_own" on public.penalty_quests
  for select using (auth.uid() = user_id);

grant select on public.penalty_quests to authenticated;
