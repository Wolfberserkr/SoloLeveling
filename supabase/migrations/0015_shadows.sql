-- ═══════════════════════════════════════════════════════════════════════════
-- 0015_shadows.sql — PHASE 9: the Shadow Army
--
-- Conquests become shadows. A defeated boss (and later: gates, tomes, the
-- Legacy Boss) inserts an `available` shadow; the `extract-shadow` action rolls
-- the Arise and flips it to `arisen`; `arisen` shadows can be deployed up to the
-- army capacity. Tier B: clients SELECT own rows, the `game` edge function
-- (service role) does every write. Passive effects derive from source + grade
-- in _shared/game/shadows.ts.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.shadows (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('boss','gate','book','legacy')),
  source_ref  text not null,            -- e.g. boss phase number; unique per conquest
  name        text not null,            -- the enemy it was (e.g. 'Iron Golem')
  grade       text not null check (grade in
                ('Soldier','Knight','Elite Knight','Marshal','Commander','Monarch')),
  status      text not null default 'available' check (status in ('available','arisen')),
  deployed    boolean not null default false,
  arisen_at   timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, source_type, source_ref)
);

create index shadows_user on public.shadows (user_id, status);

alter table public.shadows enable row level security;
create policy "shadows_select_own" on public.shadows
  for select using (auth.uid() = user_id);

grant select on public.shadows to authenticated;
