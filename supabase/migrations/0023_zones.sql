-- ═══════════════════════════════════════════════════════════════════════════
-- 0023_zones.sql — FIELD ZONES: GPS-triggered encounters at real places
--
-- zones is Tier A: a saved location is player config, not game state — the
-- client manages its own rows (like push_subscriptions). zone_triggers is
-- Tier B (service-role writes only): what a visit rolled and whether the
-- reward was claimed is game state.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── zones — the Player's marked places ──────────────────────────────────────
create table public.zones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  kind       text not null check (kind in ('gym','store','landmark')),
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  radius_m   int not null default 100 check (radius_m between 30 and 500),
  created_at timestamptz not null default now()
);

create index zones_user on public.zones (user_id);

alter table public.zones enable row level security;
create policy "zones_select_own" on public.zones
  for select using (auth.uid() = user_id);
create policy "zones_insert_own" on public.zones
  for insert with check (auth.uid() = user_id);
create policy "zones_update_own" on public.zones
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "zones_delete_own" on public.zones
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.zones to authenticated;

-- ── zone_triggers — one roll per zone per local day ─────────────────────────
-- kind 'quiet' records a visit whose roll came up empty, settling the day.
create table public.zone_triggers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  zone_id      uuid not null references public.zones(id) on delete cascade,
  local_date   date not null,
  kind         text not null check (kind in ('fight','cache','treasure','quiet')),
  title        text not null default '',
  body         text not null default '',
  payload      jsonb not null default '{}'::jsonb,
  status       text not null default 'none'
               check (status in ('active','completed','expired','none')),
  xp_reward    int not null default 0,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (zone_id, local_date)
);

create index zone_triggers_user_date on public.zone_triggers (user_id, local_date desc);

alter table public.zone_triggers enable row level security;
create policy "zone_triggers_select_own" on public.zone_triggers
  for select using (auth.uid() = user_id);

grant select on public.zone_triggers to authenticated;
