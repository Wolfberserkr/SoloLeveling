-- ═══════════════════════════════════════════════════════════════════════════
-- 0019_adaptive_load.sql — PHASE 10: the AI System Coach tunes the load
--
-- A persistent per-player training-load multiplier. The weekly review
-- (Monday cron, or an on-demand request) reads the week just finished and
-- nudges this up (progressive overload after a strong, recovered week) or down
-- (deload after a rough or under-recovered one) — bounded to [0.7, 1.5] by the
-- pure logic in _shared/game/review.ts. The Daily Training Quest's targets
-- multiply by it at generation time in ensureDailyState.
--
-- Server-written only: it is NOT added to any column-level update grant, so
-- clients can read it (profiles is SELECT-granted) but never set it.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column training_load numeric not null default 1.0
    check (training_load between 0.5 and 2.0);
