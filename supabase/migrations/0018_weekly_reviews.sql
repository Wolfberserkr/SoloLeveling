-- ═══════════════════════════════════════════════════════════════════════════
-- 0018_weekly_reviews.sql — PHASE 10: the AI System Coach (first slice)
--
-- A read-only weekly assessment. The `game` edge function aggregates the most
-- recently completed Mon–Sun week (pure math in _shared/game/review.ts), asks
-- Gemini for a narrative in the System's voice (_shared/ai.ts), and stores the
-- result here — at most one row per player per week, enforced by the unique
-- index, which also makes generation idempotent.
--
-- Tier B: clients SELECT their own reviews; only the service role writes.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.weekly_reviews (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  week_start   date not null,            -- Monday of the reviewed ISO week
  week_end     date not null,            -- the following Sunday
  summary      jsonb not null,           -- the structured ReviewSummary
  narrative    text not null,            -- the System's prose assessment
  generated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index weekly_reviews_user on public.weekly_reviews (user_id, week_start desc);

alter table public.weekly_reviews enable row level security;
create policy "weekly_reviews_select_own" on public.weekly_reviews
  for select using (auth.uid() = user_id);

grant select on public.weekly_reviews to authenticated;

-- weekly_review System Log message kind has no constraint to widen — system_messages.kind is free text.
