-- ═══════════════════════════════════════════════════════════════════════════
-- 0010_ai.sql — PHASE 6: AI (Gemini) question banks & riddles
--
-- A new 'riddle' System Event kind, its server-only answer store, and a
-- source marker on retention questions so Archive-generated ones are
-- distinguishable from the Player's own.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── system_events gains the riddle kind ─────────────────────────────────────
alter table public.system_events
  drop constraint system_events_kind_check;
alter table public.system_events
  add constraint system_events_kind_check
  check (kind in ('gate','mana_surge','xp_surge','potion_gift','riddle'));

-- ── riddle_answers — service role only: the client must not see the answer ──
create table public.riddle_answers (
  event_id   uuid primary key references public.system_events(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  answer     text not null, -- may hold aliases separated by '|'
  created_at timestamptz not null default now()
);

alter table public.riddle_answers enable row level security;
-- No policies, no grants: only the edge functions (service role) touch this.

-- ── retention_questions — who wrote the question: the Player or the Archive ─
alter table public.retention_questions
  add column source text not null default 'player'
  check (source in ('player','system'));
