-- ═══════════════════════════════════════════════════════════════════════════
-- 0034_life_jobs_offered.sql — slot offers for instant scheduling.
--
-- life-bot stores the three slots it offers on Telegram as a life_jobs row
-- with status 'offered' until the owner taps one (→ running → done) or
-- ✖️ None (→ cancelled). The sync routine ignores offered rows.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.life_jobs drop constraint if exists life_jobs_status_check;
alter table public.life_jobs add constraint life_jobs_status_check
  check (status in ('pending', 'running', 'done', 'failed', 'cancelled', 'offered'));
