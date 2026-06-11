-- ═══════════════════════════════════════════════════════════════════════════
-- RESET — wipes the old app's schema (run BEFORE 0001_core.sql).
--
-- Drops everything in the `public` schema: all old tables (profiles,
-- hunter_stats, daily_quests, workout_logs, shadows, gates, ...), functions,
-- and the old on_auth_user_created trigger (it depends on a public function,
-- so the cascade removes it). Supabase's internal schemas (auth, storage)
-- are NOT touched — existing login accounts survive.
--
-- ⚠ DESTRUCTIVE: all old game data is permanently deleted. This is the
--   agreed fresh start.
-- ═══════════════════════════════════════════════════════════════════════════

drop schema public cascade;
create schema public;

-- Restore Supabase's standard grants on the recreated schema.
grant usage on schema public to postgres, anon, authenticated, service_role;
grant create on schema public to postgres, service_role;
alter default privileges in schema public
  grant all on tables to postgres, service_role;
comment on schema public is 'standard public schema';
