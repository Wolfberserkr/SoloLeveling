-- ═══════════════════════════════════════════════════════════════════════════
-- 0030_life.sql — the Life Assistant ("Jarvis"): Telegram bot + scheduled
-- Claude routines that run schedule, training, inbox and money.
--
-- Two writers, one owner:
--   • the `life-bot` edge function (service role) — Telegram chat, the
--     minute tick (outbox, nudges, day plans), finance/tasks tools
--   • Claude scheduled routines (via the Supabase connector, service role)
--     — Gmail/Calendar/Garmin/Strava work the edge function can't reach
-- The owner can read everything from the app under RLS (future Life tab)
-- and edit the hand-kept tables (budgets, bills, goals, tasks, prefs).
--
-- Money is stored in minor units of its own currency plus a normalised
-- AWG amount, so reports never need a rate lookup (USD→AWG is pegged 1.79).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Profile & Telegram link ───────────────────────────────────────────────
create table public.life_profile (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  telegram_chat_id bigint unique,
  timezone       text not null default 'America/Aruba',
  -- prefs: { offDayBriefing:"08:30", sleepHours:8, prepMinutes:90,
  --          stepTarget:10000, windDownMinutes:45, quietHours:["23:30","06:00"] }
  prefs          jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Long-lived facts the assistant learns ("allergic to shellfish",
-- "D's birthday is 3 May"). Fed into every conversation.
create table public.life_memory (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  fact       text not null check (char_length(fact) between 1 and 500),
  area       text not null default 'general',
  created_at timestamptz not null default now()
);
create index on public.life_memory (user_id, created_at desc);

-- Rolling chat transcript (text only — the bot replays it as context).
create table public.life_messages (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  text       text not null,
  created_at timestamptz not null default now()
);
create index on public.life_messages (user_id, created_at desc);

-- Telegram retries a webhook it thinks failed; this makes each update run once.
create table public.life_updates_seen (
  update_id  bigint primary key,
  seen_at    timestamptz not null default now()
);

-- ── Work schedule ─────────────────────────────────────────────────────────
-- One row per shift. `kind` is the roster's own label (Morning/Mid/Night…).
-- calendar_event_id is filled by the sync routine once it is in Calendar.
create table public.life_shifts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null check (ends_at > starts_at),
  kind       text not null default 'Shift',
  status     text not null default 'confirmed' check (status in ('pending','confirmed','cancelled')),
  batch      text,                 -- roster upload this came from
  source     text not null default 'telegram',
  calendar_event_id text,
  reminders_done boolean not null default false,  -- shift-reminder template applied
  updated_at timestamptz not null default now(),
  unique (user_id, starts_at)
);
create index on public.life_shifts (user_id, starts_at);

-- Derived per local date by the tick: when to sleep, wake, nap, brief.
create table public.life_day_plan (
  user_id     uuid not null references auth.users(id) on delete cascade,
  local_date  date not null,
  shift_id    uuid references public.life_shifts(id) on delete set null,
  shift_kind  text,
  wake_at     timestamptz,
  bed_at      timestamptz,
  nap_from    timestamptz,
  nap_to      timestamptz,
  briefing_at timestamptz not null,
  train_window text,
  briefing_composed boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, local_date)
);

-- Upcoming calendar events, mirrored by the sync routine so the bot can
-- answer "what's on tomorrow" without Google access.
create table public.life_calendar_cache (
  user_id    uuid not null references auth.users(id) on delete cascade,
  event_id   text not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz,
  title      text not null,
  all_day    boolean not null default false,
  synced_at  timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index on public.life_calendar_cache (user_id, starts_at);

-- ── Work the bot hands to the Claude routines ─────────────────────────────
-- kind: calendar | email | garmin | strava | sheets | other
create table public.life_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,
  instruction text not null,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'pending' check (status in ('pending','running','done','failed','cancelled')),
  result      text,
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);
create index on public.life_jobs (status, created_at);

-- ── Inbox triage ──────────────────────────────────────────────────────────
-- The routine trashes obvious junk itself (status 'auto_trashed', kept here
-- for the weekly summary) and queues uncertain mail as 'pending' for a
-- Telegram Delete/Keep decision; it then executes 'approved' rows.
create table public.life_inbox (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  account     text not null default 'primary',
  message_id  text not null,
  thread_id   text,
  sender      text,
  subject     text,
  snippet     text,
  category    text,          -- promo | social | expired | receipt | important | other
  reason      text,
  action      text not null default 'trash' check (action in ('trash','archive','keep','unsubscribe')),
  status      text not null default 'pending'
              check (status in ('pending','asked','approved','rejected','done','auto_trashed')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  unique (user_id, message_id)
);
create index on public.life_inbox (user_id, status);

-- Sender rules learnt from decisions ("always delete X", "never touch Y").
create table public.life_inbox_rules (
  user_id   uuid not null references auth.users(id) on delete cascade,
  pattern   text not null,          -- sender address or @domain
  verdict   text not null check (verdict in ('trash','archive','keep')),
  created_at timestamptz not null default now(),
  primary key (user_id, pattern)
);

-- ── Finance ───────────────────────────────────────────────────────────────
create table public.life_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  occurred_on  date not null,
  amount_minor bigint not null,            -- negative = money out
  currency     text not null default 'AWG' check (currency ~ '^[A-Z]{3}$'),
  amount_awg_minor bigint not null,
  merchant     text,
  category     text not null default 'uncategorised',
  account      text,
  note         text,
  source       text not null default 'telegram' check (source in ('telegram','bank_email','receipt_email','statement','manual')),
  source_ref   text,                       -- gmail message id / statement line hash
  created_at   timestamptz not null default now(),
  unique (user_id, source_ref)
);
create index on public.life_transactions (user_id, occurred_on desc);

create table public.life_budgets (
  user_id    uuid not null references auth.users(id) on delete cascade,
  category   text not null,
  monthly_limit_awg_minor bigint not null check (monthly_limit_awg_minor > 0),
  primary key (user_id, category)
);

-- Bills, renewals and subscriptions. next_due advances when paid.
create table public.life_bills (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  kind        text not null default 'bill' check (kind in ('bill','subscription','renewal')),
  amount_minor bigint,
  currency    text not null default 'AWG',
  cadence     text not null default 'monthly' check (cadence in ('weekly','monthly','quarterly','yearly','once')),
  next_due    date not null,
  autopay     boolean not null default false,
  active      boolean not null default true,
  last_paid   date,
  note        text,
  created_at  timestamptz not null default now()
);
create index on public.life_bills (user_id, next_due);

create table public.life_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  target_awg_minor bigint not null check (target_awg_minor > 0),
  saved_awg_minor  bigint not null default 0,
  deadline    date,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── Tasks, errands, groceries ─────────────────────────────────────────────
-- area: household | errand | grocery | family | learning | work | general
create table public.life_tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  area       text not null default 'general',
  due_on     date,
  done_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on public.life_tasks (user_id, done_at, due_on);

-- ── Health snapshot (Garmin, written by the sync routine) ─────────────────
create table public.life_health (
  user_id     uuid not null references auth.users(id) on delete cascade,
  local_date  date not null,
  data        jsonb not null default '{}'::jsonb,  -- sleepH, sleepScore, hrv, hrvStatus, bodyBattery, readiness, rhr, steps, stress
  updated_at  timestamptz not null default now(),
  primary key (user_id, local_date)
);

-- ── Outgoing Telegram messages + nudge dedupe ─────────────────────────────
create table public.life_outbox (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null default 'message',
  text        text not null,
  buttons     jsonb,                 -- [[{text, data}]] inline keyboard rows
  send_after  timestamptz not null default now(),
  sent_at     timestamptz,
  error       text,
  created_at  timestamptz not null default now()
);
create index on public.life_outbox (sent_at, send_after);

create table public.life_nudge_log (
  user_id  uuid not null references auth.users(id) on delete cascade,
  key      text not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, key)
);

-- ── RLS: the owner reads everything, edits the hand-kept tables ───────────
do $$
declare t text;
begin
  foreach t in array array['life_profile','life_memory','life_messages','life_shifts','life_day_plan',
    'life_calendar_cache','life_jobs','life_inbox','life_inbox_rules','life_transactions','life_budgets',
    'life_bills','life_goals','life_tasks','life_health','life_outbox','life_nudge_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', t || '_own_select', t);
  end loop;
  foreach t in array array['life_profile','life_memory','life_shifts','life_inbox_rules','life_transactions',
    'life_budgets','life_bills','life_goals','life_tasks']
  loop
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', t || '_own_insert', t);
    execute format('create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t || '_own_update', t);
    execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', t || '_own_delete', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
  foreach t in array array['life_profile','life_memory','life_messages','life_shifts','life_day_plan',
    'life_calendar_cache','life_jobs','life_inbox','life_inbox_rules','life_transactions','life_budgets',
    'life_bills','life_goals','life_tasks','life_health','life_outbox','life_nudge_log']
  loop
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
-- life_updates_seen is service-role only.
alter table public.life_updates_seen enable row level security;

-- Monthly spend per category in AWG (for the bot, the routines and the app).
create view public.life_month_spend with (security_invoker = true) as
  select user_id,
         date_trunc('month', occurred_on)::date as month,
         category,
         -sum(amount_awg_minor) filter (where amount_awg_minor < 0) as spent_awg_minor,
         sum(amount_awg_minor) filter (where amount_awg_minor > 0) as income_awg_minor,
         count(*) as n
  from public.life_transactions
  group by 1, 2, 3;
grant select on public.life_month_spend to authenticated;
