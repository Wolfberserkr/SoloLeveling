-- ═══════════════════════════════════════════════════════════════════════════
-- 0005_library.sql — PHASE 4: the Library (Read → Reflect → Apply → Retain)
-- All four tables are Tier B: clients SELECT own rows; the `game` edge
-- function (service role) does every write. Grants are explicit because
-- this project's schema defaults give authenticated nothing (see 0003).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── books — the tome registry ───────────────────────────────────────────────
create table public.books (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 200),
  author        text not null default '',
  total_pages   int  not null check (total_pages between 10 and 5000),
  pages_read    int  not null default 0 check (pages_read >= 0),
  status        text not null default 'reading'
                check (status in ('reading','finished','abandoned')),
  started_date  date not null,
  finished_date date,
  created_at    timestamptz not null default now()
);

create index books_user_status on public.books (user_id, status);

alter table public.books enable row level security;
create policy "books_select_own" on public.books
  for select using (auth.uid() = user_id);

-- ── reading_sessions — Read + Reflect: one entry per tome per local day ─────
create table public.reading_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  book_id    uuid not null references public.books(id) on delete cascade,
  local_date date not null,
  pages      int  not null check (pages > 0 and pages <= 500),
  reflection text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, book_id, local_date)
);

create index reading_sessions_user_date on public.reading_sessions (user_id, local_date);

alter table public.reading_sessions enable row level security;
create policy "reading_sessions_select_own" on public.reading_sessions
  for select using (auth.uid() = user_id);

-- ── book_applications — Apply: one concrete action per tome per day ─────────
create table public.book_applications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  book_id    uuid not null references public.books(id) on delete cascade,
  local_date date not null,
  action     text not null,
  created_at timestamptz not null default now(),
  unique (user_id, book_id, local_date)
);

create index book_applications_user_date on public.book_applications (user_id, local_date);

alter table public.book_applications enable row level security;
create policy "book_applications_select_own" on public.book_applications
  for select using (auth.uid() = user_id);

-- ── retention_questions — Retain: the Player's own question bank ────────────
-- The System re-asks on a spaced schedule (1/3/7/14/30 days); `due_date`
-- goes null once mastered.
create table public.retention_questions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  book_id        uuid not null references public.books(id) on delete cascade,
  prompt         text not null,
  answer         text not null default '',
  stage          int  not null default 0,
  due_date       date,
  mastered       boolean not null default false,
  times_reviewed int  not null default 0,
  created_at     timestamptz not null default now()
);

create index retention_questions_due
  on public.retention_questions (user_id, due_date)
  where not mastered;

alter table public.retention_questions enable row level security;
create policy "retention_questions_select_own" on public.retention_questions
  for select using (auth.uid() = user_id);

-- Clients read their own rows; all writes go through the edge function.
grant select on
  public.books,
  public.reading_sessions,
  public.book_applications,
  public.retention_questions
to authenticated;
