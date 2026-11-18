-- ═══════════════════════════════════════════════════════════════════════════
-- 0034_life_jobs_offered.sql — slot offers for instant scheduling.
--
-- life-bot stores the three slots it offers on Telegram as a life_jobs row
-- with status 'offered' until the owner taps one (→ running → done) or
-- ✖️ None (→ cancelled). The sync routine ignores offered rows.
-- ═══════════════════════════════════════════════════════════════════════════

-- started_at: when life-bot began booking a job itself (add_event, or the tap
-- on an offered slot). The sync only rescues a life-bot booking stuck in
-- 'running' 10 minutes after this, never by created_at (an offer can be days old).
alter table public.life_jobs add column if not exists started_at timestamptz;

alter table public.life_jobs drop constraint if exists life_jobs_status_check;
alter table public.life_jobs add constraint life_jobs_status_check
  check (status in ('pending', 'running', 'done', 'failed', 'cancelled', 'offered'));
