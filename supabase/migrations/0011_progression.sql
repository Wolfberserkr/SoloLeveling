-- ═══════════════════════════════════════════════════════════════════════════
-- 0011_progression.sql — PHASE 7: Skills · Classes · Ranks · Titles
--
-- player_skills / player_titles are Tier B: clients SELECT own rows, the
-- `game` edge function (service role) does every write. Rank and class live
-- on profiles (already revoked from client updates in 0001). Stats grow via
-- bump_stats below — service role only, like award_xp.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── player_skills — passive perks unlocked by milestones ────────────────────
create table public.player_skills (
  user_id     uuid not null references auth.users(id) on delete cascade,
  skill_key   text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, skill_key)
);

alter table public.player_skills enable row level security;
create policy "player_skills_select_own" on public.player_skills
  for select using (auth.uid() = user_id);

-- ── player_titles — earned badges; profiles.equipped_title wears one ────────
create table public.player_titles (
  user_id   uuid not null references auth.users(id) on delete cascade,
  title_key text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, title_key)
);

alter table public.player_titles enable row level security;
create policy "player_titles_select_own" on public.player_titles
  for select using (auth.uid() = user_id);

grant select on public.player_skills, public.player_titles to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- bump_stats — the only path that raises attributes. Increments are decided
-- server-side (STAT_AWARDS in progression.ts); values cap at 100. Unknown
-- stat keys no-op against the stats check constraint.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.bump_stats(p_user uuid, p_bumps jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  v numeric;
begin
  for k, v in select key, value::numeric from jsonb_each_text(p_bumps) loop
    if v > 0 and v <= 5 then
      update stats set value = least(value + v, 100)
      where user_id = p_user and stat = k;
    end if;
  end loop;
end;
$$;

revoke execute on function public.bump_stats from public, anon, authenticated;
grant execute on function public.bump_stats to service_role;
