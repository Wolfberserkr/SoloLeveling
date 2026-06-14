-- ═══════════════════════════════════════════════════════════════════════════
-- 0011_progression.sql — PHASE 7, part 1: Ranks + living Stats
--
-- Brings two dormant fields to life:
--   • profiles.rank  — promoted by level (was hardcoded 'E')
--   • stats.value    — grown by what the Player does (were frozen at 10)
--
-- Rank promotion + essence reward are applied in the `game` edge function's
-- awardXp wrapper (it already runs on every level-up). This migration adds the
-- stat-increment RPC and a one-time backfill so existing players' ranks catch
-- up to the level they have already reached.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── increment_stats — the ONLY path that grows attributes (Tier B) ───────────
-- p_gains is a flat jsonb map of stat → amount, e.g. {"STR":0.3,"END":0.3}.
-- Unknown keys match no row and are silently ignored.
create or replace function public.increment_stats(p_user uuid, p_gains jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  v numeric;
begin
  for k, v in select key, value::numeric from jsonb_each_text(p_gains)
  loop
    update stats
    set value = value + v
    where user_id = p_user and stat = k;
  end loop;
end;
$$;

revoke execute on function public.increment_stats from public, anon, authenticated;
grant execute on function public.increment_stats to service_role;

-- ── grant_essence — server-authoritative Essence Stone awards (Tier B) ───────
-- Used by rank-ups now; Titles and Skills (later parts) reward through here too.
create or replace function public.grant_essence(p_user uuid, p_amount int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount <= 0 then return; end if;
  update profiles set essence_stones = essence_stones + p_amount where user_id = p_user;
end;
$$;

revoke execute on function public.grant_essence from public, anon, authenticated;
grant execute on function public.grant_essence to service_role;

-- ── Backfill: existing ranks catch up to current level ───────────────────────
-- Thresholds MUST mirror RANK_THRESHOLDS in _shared/game/progression.ts.
update public.profiles set rank = case
  when level >= 75 then 'Monarch'
  when level >= 50 then 'National'
  when level >= 26 then 'S'
  when level >= 19 then 'A'
  when level >= 13 then 'B'
  when level >= 8  then 'C'
  when level >= 4  then 'D'
  else 'E'
end;
