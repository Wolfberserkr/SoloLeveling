-- ═══════════════════════════════════════════════════════════════════════════
-- 0014_legacy.sql — PHASE 8: the Legacy Boss (your past self)
--
-- Every 90 days the System snapshots the Player's measurable capability into a
-- row here. When due_date arrives the snapshot is the boss; the edge function's
-- challenge-legacy action captures the present self, compares (see legacy.ts),
-- and on victory clears it and arms the next snapshot. Tier B: clients SELECT
-- their own snapshots; only the service role writes.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.legacy_snapshots (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  taken_on     date not null,
  due_date     date not null,
  metrics      jsonb not null,
  status       text not null default 'armed' check (status in ('armed','defeated')),
  defeated_on  date,
  last_attempt date,
  created_at   timestamptz not null default now()
);

create index legacy_snapshots_user on public.legacy_snapshots (user_id, status);

-- At most one armed snapshot per Player at a time.
create unique index legacy_snapshots_one_armed
  on public.legacy_snapshots (user_id) where status = 'armed';

alter table public.legacy_snapshots enable row level security;
create policy "legacy_snapshots_select_own" on public.legacy_snapshots
  for select using (auth.uid() = user_id);

grant select on public.legacy_snapshots to authenticated;
