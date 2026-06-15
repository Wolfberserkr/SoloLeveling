-- ═══════════════════════════════════════════════════════════════════════════
-- 0016_reminder_hour.sql — player-chosen evening reminder time
--
-- The hourly cron sends the "Daily Quest incomplete" push during a fixed
-- evening window. This lets each player pick the exact local hour it fires.
-- reminder_hour is the third client-writable profiles column (see 0001) —
-- it only affects notification timing, never game state, so it is safe to
-- expose. The cron compares it against the player's local hour.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column reminder_hour smallint not null default 18
    check (reminder_hour between 0 and 23);

-- Additive column-level grant: clients may now also update reminder_hour.
grant update (reminder_hour) on public.profiles to authenticated;
