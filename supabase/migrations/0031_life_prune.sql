-- ═══════════════════════════════════════════════════════════════════════════
-- 0031_life_prune.sql — cleanup for the background sync without bare DELETEs.
--
-- The scheduled Claude routine writes through the Supabase connector, which
-- asks a human to confirm any DELETE statement. Nobody is there to answer in
-- a background run, so the write times out. The routine instead calls this
-- function (a plain SELECT) to drop calendar-cache rows it didn't see.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.life_prune_calendar_cache(
  p_user uuid, p_from timestamptz, p_to timestamptz, p_seen_since timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from public.life_calendar_cache
  where user_id = p_user
    and starts_at >= p_from and starts_at < p_to
    and synced_at < p_seen_since;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.life_prune_calendar_cache(uuid, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
