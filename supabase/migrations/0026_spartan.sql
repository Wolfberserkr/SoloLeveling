-- ═══════════════════════════════════════════════════════════════════════════
-- 0026_spartan.sql — THE SPARTAN PROTOCOL: an optional, binding side-mission.
--
-- A 6-month campaign (docs/SPARTAN_PROTOCOL.md) the Player may enlist in. It
-- runs as a meta-layer over the existing Daily Training Quest and Gym Dungeon:
-- each of four chapters carries a deadline and a set of derived checkpoints
-- (bodyweight, streak, protein cadence, gym cadence) plus the mapped dungeon
-- exit boss. Clearing all four grants exclusive rewards. Missing a chapter
-- deadline — or deserting — COLLAPSES the campaign (a rank/XP toll, applied by
-- the game function, with a re-enlist cooldown).
--
-- One row per Player, created on enlist. Tier B: clients SELECT their own row;
-- only the `game` edge function (service role) writes it.
--
-- Also widens the shadows source_type constraint to admit the capstone's
-- exclusive 'campaign' shadow (The Spartan, Monarch grade).
-- ═══════════════════════════════════════════════════════════════════════════

create table public.spartan_campaign (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  status                text not null default 'active'
                          check (status in ('inactive', 'active', 'completed', 'failed')),
  current_chapter       int  not null default 1 check (current_chapter between 1 and 4),
  chapters_cleared      int  not null default 0 check (chapters_cleared between 0 and 4),
  enlisted_at           date not null,
  chapter_started_at    date not null,
  reenlist_available_on date,                 -- set when a campaign collapses
  failed_at             date,
  completed_at          date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.spartan_campaign enable row level security;
create policy "spartan_campaign_select_own" on public.spartan_campaign
  for select using (auth.uid() = user_id);

grant select on public.spartan_campaign to authenticated;

-- The campaign capstone raises an exclusive Shadow — widen the source_type set.
alter table public.shadows drop constraint shadows_source_type_check;
alter table public.shadows
  add constraint shadows_source_type_check
  check (source_type in ('boss', 'gate', 'book', 'legacy', 'encounter', 'campaign'));
