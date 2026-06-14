-- ═══════════════════════════════════════════════════════════════════════════
-- 0012_titles.sql — PHASE 7, part 2: Titles (achievements)
--
-- Earned titles are recorded server-side (Tier B). Catalog + unlock predicates
-- live in _shared/game/progression.ts (TITLES / evaluateTitles); the edge
-- function's checkTitles sweep inserts newly earned rows and pays Essence via
-- grant_essence (0011). The equipped title is set through the game function.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.titles (
  user_id    uuid not null references auth.users(id) on delete cascade,
  title_key  text not null,
  earned_at  timestamptz not null default now(),
  primary key (user_id, title_key)
);

alter table public.titles enable row level security;
create policy "titles_select_own" on public.titles
  for select using (auth.uid() = user_id);

-- Clients read their earned titles; only the service role grants them.
grant select on public.titles to authenticated;
