-- ═══════════════════════════════════════════════════════════════════════════
-- 0003_grants.sql — client-facing table privileges
--
-- The reset script recreates `public` with default privileges for postgres
-- and service_role ONLY (tighter than Supabase's stock defaults), so every
-- client-visible surface must be granted explicitly. Table grants are the
-- outer gate; RLS policies (already in place) scope rows to the owner.
--
-- NOTE for future phases: new tables get NO authenticated access by
-- default — add an explicit `grant select` here-style when clients must
-- read them.
-- ═══════════════════════════════════════════════════════════════════════════

grant select on
  public.profiles,
  public.stats,
  public.xp_ledger,
  public.training_quests,
  public.training_totals,
  public.system_messages,
  public.daily_quests,
  public.sleep_logs
to authenticated;

-- The only two client-writable surfaces, column-scoped (Tier A).
grant update (display_name, timezone) on public.profiles to authenticated;
grant update (read) on public.system_messages to authenticated;
