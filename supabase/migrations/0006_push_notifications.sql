-- Push subscriptions: one row per browser/device per user.
create table public.push_subscriptions (
  user_id     uuid    not null references auth.users(id) on delete cascade,
  endpoint    text    not null,
  p256dh      text    not null,
  auth        text    not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
create policy "read own push subs" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "insert own push subs" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "delete own push subs" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- Dedup log: prevents the same notification kind from firing twice in one day.
create table public.push_notification_log (
  id          bigserial primary key,
  user_id     uuid    not null references auth.users(id) on delete cascade,
  kind        text    not null,  -- 'daily_reminder' | 'penalty_warning' | 'gate_warning'
  sent_date   date    not null,
  sent_at     timestamptz not null default now()
);
create index on public.push_notification_log (user_id, kind, sent_date);
alter table public.push_notification_log enable row level security;
-- Only the service role (cron) writes here; no direct user access needed.
