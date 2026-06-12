-- ═══════════════════════════════════════════════════════════════════════════
-- 0007_events_push.sql — PHASE 5: random System Events, web push, cron log
--
-- system_events / notification_log are Tier B (service-role writes only).
-- push_subscriptions is Tier A: a push endpoint is not game state, so the
-- client manages its own rows directly (insert/delete own).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── system_events — at most one rolled event per user per local day ─────────
create table public.system_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  local_date   date not null,
  kind         text not null check (kind in ('gate','mana_surge','xp_surge','potion_gift')),
  title        text not null,
  body         text not null default '',
  payload      jsonb not null default '{}'::jsonb,
  status       text not null default 'active'
               check (status in ('active','completed','expired')),
  xp_reward    int not null default 0,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, local_date)
);

create index system_events_user_date on public.system_events (user_id, local_date desc);

alter table public.system_events enable row level security;
create policy "system_events_select_own" on public.system_events
  for select using (auth.uid() = user_id);

grant select on public.system_events to authenticated;

-- ── push_subscriptions — Tier A: the client owns its own endpoints ──────────
create table public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
-- Update needed for client upsert when re-subscribing the same endpoint.
create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- ── notification_log — cron idempotency: one send per user/kind/day ─────────
create table public.notification_log (
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  local_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, local_date)
);

alter table public.notification_log enable row level security;
-- Service role only: no policies, no grants.
