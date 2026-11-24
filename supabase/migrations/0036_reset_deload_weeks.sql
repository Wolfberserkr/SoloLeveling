-- ═══════════════════════════════════════════════════════════════════════════
-- 0036_reset_deload_weeks.sql — the Reset program's recurring deload cycle.
--
-- The program used to be a fixed 8-week plan with one deload in week 5, and
-- the week counter stopped at 12. It now runs in 6-week blocks (5 hard weeks,
-- then a deload) that repeat for as long as she trains, plus a switch to take
-- a deload early. Two changes to reset_app_state:
--   • deload_weeks — the program weeks she switched to a deload by hand. The
--     client derives the whole block calendar from week + this list, so it is
--     the only extra state the cycle needs. Additive, defaults to empty, so
--     existing rows and older clients keep working.
--   • the week check widens from 1–12 to 1–99: the counter now keeps counting
--     block after block, and week 13 would otherwise be rejected on save.
-- RLS from 0025 already covers the table (owner reads and writes own row).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.reset_app_state
  add column if not exists deload_weeks int[] not null default '{}';

alter table public.reset_app_state
  drop constraint if exists reset_app_state_week_check;

alter table public.reset_app_state
  add constraint reset_app_state_week_check check (week between 1 and 99);
