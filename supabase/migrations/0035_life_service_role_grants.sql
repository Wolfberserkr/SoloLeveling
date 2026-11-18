-- ═══════════════════════════════════════════════════════════════════════════
-- 0035_life_service_role_grants.sql
--
-- 0031 and 0032 revoked EXECUTE from public/anon/authenticated on the two
-- life helper functions, which also took it away from service_role (it only
-- had EXECUTE through PUBLIC). life-bot's tick calls life_api_usage_summary()
-- as service_role, so the API-budget nudge failed with 42501 every 15 minutes.
-- Grant it back to service_role only; signed-in users still can't call them.
-- ═══════════════════════════════════════════════════════════════════════════

grant execute on function public.life_api_usage_summary(uuid) to service_role;
grant execute on function public.life_prune_calendar_cache(uuid, timestamptz, timestamptz, timestamptz) to service_role;
