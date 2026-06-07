-- Phase 1 engagement features: Titles, Shadow Army, Random Gates.
-- Run in the Supabase SQL Editor after 0002.

-- ─── TITLES ─────────────────────────────────────────────────────────────
-- A title is just the key of an unlocked achievement. The "library" of
-- owned titles is derived from the achievements table — single source of
-- truth, no sync bugs.
alter table public.profiles
  add column if not exists active_title text;

-- ─── SHADOW ARMY ────────────────────────────────────────────────────────
-- Entities extracted from cleared dungeons. Distinct from the
-- 'shadow_extraction' power-up (which is a deload-week consumable).
create table if not exists public.shadows (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  rarity text not null check (rarity in ('common','rare','epic','legendary')),
  power int not null,
  source_session text,
  extracted_at timestamptz not null default now()
);
create index if not exists idx_shadows_user
  on public.shadows(user_id, extracted_at desc);

alter table public.shadows enable row level security;
drop policy if exists "own_select_shadows" on public.shadows;
create policy "own_select_shadows" on public.shadows
  for select using (auth.uid() = user_id);

-- ─── RANDOM GATES ───────────────────────────────────────────────────────
-- Emergent quests that spawn unannounced with a 24h timer.
create table if not exists public.gates (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  gate_key text not null,
  label text not null,
  rank text not null,
  target int not null,
  progress int not null default 0,
  unit text,
  mirrors text,
  status text not null default 'active'
    check (status in ('active','cleared','failed','expired')),
  spawned_at timestamptz not null default now(),
  expires_at timestamptz not null,
  reward_xp int not null,
  reward_extra text
);
-- One active gate per user, enforced at the DB level (no race on spawn).
create unique index if not exists uniq_one_active_gate_per_user
  on public.gates(user_id)
  where status = 'active';
create index if not exists idx_gates_user_status
  on public.gates(user_id, status);

alter table public.gates enable row level security;
drop policy if exists "own_select_gates" on public.gates;
create policy "own_select_gates" on public.gates
  for select using (auth.uid() = user_id);

-- Track when we last rolled the daily spawn so we don't re-roll on every
-- page load.
alter table public.hunter_stats
  add column if not exists last_gate_check date;
