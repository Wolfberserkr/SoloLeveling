-- ═══════════════════════════════════════════════════════════════════════════
-- 0017_encounters.sql — Random Encounters: essence/XP/item drops
--
-- On-demand "Explore" (mana-gated, capped per day) rolls a DND-style scenario;
-- a stat-check action grants essence + XP + items, rarely a Shadow. Item
-- catalog/balance lives in code (_shared/game/encounters.ts, items.ts); the DB
-- stores per-user ownership (inventory) and equipped state (equipment).
--
-- Tier B everywhere: clients SELECT their own rows; the `game` edge function
-- (service role) does every write, via direct updates and the grant_item /
-- consume_item RPCs (mirroring grant_essence in 0011).
-- ═══════════════════════════════════════════════════════════════════════════

-- Daily Explore allowance lives on the profile, reset by ensureDailyState.
-- Server-written only — NOT added to the client-updatable column grant.
alter table public.profiles
  add column explores_today int not null default 0;

-- Encounters can be extracted as Shadows: widen the source_type constraint.
alter table public.shadows drop constraint shadows_source_type_check;
alter table public.shadows
  add constraint shadows_source_type_check
  check (source_type in ('boss','gate','book','legacy','encounter'));

-- ── encounters ──────────────────────────────────────────────────────────────
-- One 'active' encounter at a time (must be resolved before exploring again);
-- resolved rows are history. The rolled scenario + choices live in payload; the
-- per-attempt RNG seed makes resolution reproducible without being replayable.
create table public.encounters (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  local_date    date not null,
  scenario_key  text not null,
  seed          bigint not null,
  level         int not null,
  rank          text not null,
  mana_spent    int not null default 0,
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'active'
                check (status in ('active','won','lost')),
  chosen_key    text,
  result        jsonb,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

-- At most one active encounter per user.
create unique index encounters_one_active
  on public.encounters (user_id) where status = 'active';
create index encounters_user_date on public.encounters (user_id, local_date desc);

alter table public.encounters enable row level security;
create policy "encounters_select_own" on public.encounters
  for select using (auth.uid() = user_id);
grant select on public.encounters to authenticated;

-- ── inventory ───────────────────────────────────────────────────────────────
create table public.inventory (
  user_id    uuid not null references auth.users(id) on delete cascade,
  item_key   text not null,                  -- references the code catalog (items.ts)
  quantity   int not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_key)
);

alter table public.inventory enable row level security;
create policy "inventory_select_own" on public.inventory
  for select using (auth.uid() = user_id);
grant select on public.inventory to authenticated;

-- ── equipment ───────────────────────────────────────────────────────────────
-- Equipped gear is temporary: consumed on equip, expires at expires_at. The
-- itemStatMultiplier only counts active, non-expired rows; ensureDailyState
-- sweeps expired ones inactive.
create table public.equipment (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  item_key    text not null,
  equipped_at timestamptz not null default now(),
  expires_at  timestamptz not null,
  active      boolean not null default true
);

create index equipment_user_active on public.equipment (user_id, active);

alter table public.equipment enable row level security;
create policy "equipment_select_own" on public.equipment
  for select using (auth.uid() = user_id);
grant select on public.equipment to authenticated;

-- ── grant_item — server-authoritative item awards (Tier B) ───────────────────
create or replace function public.grant_item(p_user uuid, p_item_key text, p_qty int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_qty <= 0 then return; end if;
  insert into inventory (user_id, item_key, quantity, updated_at)
  values (p_user, p_item_key, p_qty, now())
  on conflict (user_id, item_key)
  do update set quantity = inventory.quantity + excluded.quantity, updated_at = now();
end;
$$;

revoke execute on function public.grant_item from public, anon, authenticated;
grant execute on function public.grant_item to service_role;

-- ── consume_item — atomic decrement; true only if enough were held ───────────
create or replace function public.consume_item(p_user uuid, p_item_key text, p_qty int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
begin
  if p_qty <= 0 then return false; end if;
  update inventory
    set quantity = quantity - p_qty, updated_at = now()
    where user_id = p_user and item_key = p_item_key and quantity >= p_qty;
  get diagnostics v_ok = row_count;
  return v_ok;
end;
$$;

revoke execute on function public.consume_item from public, anon, authenticated;
grant execute on function public.consume_item to service_role;
