-- ═══════════════════════════════════════════════════════════════════════════
-- 0008_gym_session_kind.sql — record which split session a dungeon run was
-- The cycle is a suggestion, not a lock: the Player picks Upper/Lower A/B
-- and the run logs what was actually trained.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.gym_sessions add column session_kind text not null default '';
