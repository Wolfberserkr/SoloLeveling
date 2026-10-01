-- =====================================================================
-- 0027_ascend.sql — Ascend (life RPG) alongside the System
--
-- Ascend lives in the same project and shares auth.users with the System,
-- but keeps its own tables (ascend_*) and its own level curve. Nothing in
-- the System's tables, functions or triggers is touched.
--
-- Same pattern as the System: clients read their own rows. Everything that
-- earns or removes XP goes through SECURITY DEFINER functions keyed on
-- auth.uid(), so the XP ledger (ascend_completions) can't be written to
-- directly from the browser. Plain edits (renaming a quest, changing its
-- days, adding a ticket) are direct table writes guarded by RLS and
-- column-level grants.
--
-- Principles carried over from the prototype:
--   * no penalties — nothing ever subtracts XP except undoing a mistake
--   * 3–5 daily quests per weekday (hard cap 5, enforced by trigger)
--   * total XP to reach level n = 25 × (n − 1) × (n + 2), capped at 100
-- =====================================================================

-- ---------------------------------------------------------------------
-- Level curve
-- ---------------------------------------------------------------------
create or replace function public.ascend_xp_for_level(p_level int)
returns bigint
language sql immutable
set search_path = ''
as $$
  select 25::bigint * (least(greatest(p_level, 1), 100) - 1) * (least(greatest(p_level, 1), 100) + 2)
$$;

create or replace function public.ascend_level_from_xp(p_xp bigint)
returns int
language sql immutable
set search_path = ''
as $$
  select case
           when s.n < 100 and public.ascend_xp_for_level(s.n + 1) <= s.x then s.n + 1
           when s.n > 1 and public.ascend_xp_for_level(s.n) > s.x then s.n - 1
           else s.n
         end
  from (
    select greatest(coalesce(p_xp, 0), 0) as x,
           least(100, greatest(1, floor((-1 + sqrt(9 + 4 * greatest(coalesce(p_xp, 0), 0) / 25.0)) / 2)::int)) as n
  ) s
$$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.ascend_profiles (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  settings    jsonb not null default '{}'::jsonb,
  enrolled_at timestamptz not null default now()
);

create table public.ascend_stats (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id       text not null check (id ~ '^[a-z0-9_.-]{1,40}$'),
  name     text not null check (char_length(name) between 1 and 40),
  icon     text not null default '⭐' check (char_length(icon) between 1 and 8),
  color    text not null default 'slate'
           check (color in ('blue','green','teal','amber','rose','violet','indigo','orange','cyan','slate')),
  position smallint not null default 0,
  primary key (user_id, id)
);

create table public.ascend_subskills (
  user_id  uuid not null default auth.uid(),
  id       text not null check (id ~ '^[a-z0-9_.-]{1,80}$'),
  stat_id  text not null,
  name     text not null check (char_length(name) between 1 and 40),
  note     text not null default '' check (char_length(note) <= 60),
  position smallint not null default 0,
  primary key (user_id, id),
  foreign key (user_id, stat_id) references public.ascend_stats(user_id, id) on delete cascade
);
create index ascend_subskills_stat_idx on public.ascend_subskills (user_id, stat_id);

create table public.ascend_quests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type       text not null check (type in ('daily','side','main')),
  title      text not null check (char_length(title) between 1 and 200),
  stat_id    text not null,
  sub_id     text,
  xp         int not null default 0 check (xp between 0 and 1000),
  days       smallint[] not null default '{}' check (days <@ array[0,1,2,3,4,5,6]::smallint[]),  -- 0 = Sunday
  timed      boolean not null default false,
  due        date,
  target     date,
  done_at    date,                     -- side quests only; set by ascend_complete_quest
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (user_id, stat_id) references public.ascend_stats(user_id, id),
  foreign key (user_id, sub_id)  references public.ascend_subskills(user_id, id) on delete set null (sub_id),
  check (type <> 'daily' or cardinality(days) > 0),
  check (type = 'main' or xp > 0)
);
create index ascend_quests_user_idx on public.ascend_quests (user_id, type) where not archived;
create index ascend_quests_stat_idx on public.ascend_quests (user_id, stat_id);
create index ascend_quests_sub_idx  on public.ascend_quests (user_id, sub_id);

create table public.ascend_milestones (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quest_id uuid not null references public.ascend_quests(id) on delete cascade,
  title    text not null check (char_length(title) between 1 and 200),
  xp       int not null default 100 check (xp between 1 and 1000),
  position smallint not null default 0,
  done_at  date                        -- set by ascend_toggle_milestone
);
create index ascend_milestones_quest_idx on public.ascend_milestones (quest_id, position);
create index ascend_milestones_user_idx  on public.ascend_milestones (user_id);

create table public.ascend_bosses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title          text not null check (char_length(title) between 1 and 200),
  stat_id        text not null,
  sub_id         text,
  xp             int not null default 300 check (xp between 1 and 1000),
  avoiding_since date,
  why            text not null default '' check (char_length(why) <= 1000),
  defeated_at    date,                 -- set by ascend_defeat_boss
  created_at     timestamptz not null default now(),
  foreign key (user_id, stat_id) references public.ascend_stats(user_id, id),
  foreign key (user_id, sub_id)  references public.ascend_subskills(user_id, id) on delete set null (sub_id)
);
create index ascend_bosses_user_idx on public.ascend_bosses (user_id, stat_id);
create index ascend_bosses_sub_idx  on public.ascend_bosses (user_id, sub_id);

create table public.ascend_tickets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  xp         int not null check (xp > 0),
  title      text not null check (char_length(title) between 1 and 120),
  claimed_at date,                     -- set by ascend_claim_ticket
  created_at timestamptz not null default now()
);
create index ascend_tickets_user_idx on public.ascend_tickets (user_id, xp);

create table public.ascend_reviews (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  week_start date not null,            -- Monday
  wins       text not null default '',
  slipped    text not null default '',
  focus_stat text,
  stoic      text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

-- The XP ledger. Single source of truth for every level, bar and chart.
create table public.ascend_completions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('daily','side','focus','milestone','boss','review')),
  quest_id     uuid references public.ascend_quests(id) on delete set null,
  milestone_id uuid references public.ascend_milestones(id) on delete set null,
  boss_id      uuid references public.ascend_bosses(id) on delete set null,
  review_id    uuid references public.ascend_reviews(id) on delete set null,
  title        text not null,
  parent_title text,
  stat_id      text not null,          -- denormalised on purpose: history survives renames and deletions
  sub_id       text,
  xp           int not null check (xp > 0),
  minutes      int check (minutes between 1 and 600),
  local_date   date not null,
  created_at   timestamptz not null default now()
);
create unique index ascend_completions_daily_once on public.ascend_completions (quest_id, local_date) where kind = 'daily';
create index ascend_completions_user_date on public.ascend_completions (user_id, local_date desc);
create index ascend_completions_quest_idx on public.ascend_completions (quest_id);
create index ascend_completions_ms_idx    on public.ascend_completions (milestone_id);
create index ascend_completions_boss_idx  on public.ascend_completions (boss_id);
create index ascend_completions_rev_idx   on public.ascend_completions (review_id);

-- ---------------------------------------------------------------------
-- Daily cap: at most 5 active daily quests on any weekday
-- ---------------------------------------------------------------------
create or replace function public.ascend_enforce_daily_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  d smallint;
  n int;
begin
  if new.type <> 'daily' or new.archived then
    return new;
  end if;
  foreach d in array new.days loop
    select count(*) into n
      from public.ascend_quests q
     where q.user_id = new.user_id and q.type = 'daily' and not q.archived
       and q.id <> new.id and d = any(q.days);
    if n >= 5 then
      raise exception '% already has 5 daily quests',
        (array['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])[d + 1]
        using errcode = 'check_violation',
              hint = 'Keep each day to 3–5 non-negotiables. Swap one out first, or make this a side quest.';
    end if;
  end loop;
  return new;
end;
$$;

create trigger ascend_quests_daily_cap
  before insert or update of days, type, archived on public.ascend_quests
  for each row execute function public.ascend_enforce_daily_cap();

-- ---------------------------------------------------------------------
-- Read models
-- ---------------------------------------------------------------------
create view public.ascend_player with (security_invoker = true) as
select p.user_id,
       coalesce(sum(c.xp), 0)::bigint                              as xp_total,
       public.ascend_level_from_xp(coalesce(sum(c.xp), 0)::bigint) as level
  from public.ascend_profiles p
  left join public.ascend_completions c on c.user_id = p.user_id
 group by p.user_id;

create view public.ascend_stat_xp with (security_invoker = true) as
select s.user_id, s.id as stat_id, s.name, s.icon, s.color, s.position,
       coalesce(sum(c.xp), 0)::bigint                              as xp,
       public.ascend_level_from_xp(coalesce(sum(c.xp), 0)::bigint) as level
  from public.ascend_stats s
  left join public.ascend_completions c on c.user_id = s.user_id and c.stat_id = s.id
 group by s.user_id, s.id;

create view public.ascend_subskill_xp with (security_invoker = true) as
select s.user_id, s.id as sub_id, s.stat_id, s.name, s.note, s.position,
       coalesce(sum(c.xp), 0)::bigint                              as xp,
       public.ascend_level_from_xp(coalesce(sum(c.xp), 0)::bigint) as level
  from public.ascend_subskills s
  left join public.ascend_completions c on c.user_id = s.user_id and c.sub_id = s.id
 group by s.user_id, s.id;

-- ---------------------------------------------------------------------
-- Actions (SECURITY DEFINER, always scoped to auth.uid())
-- ---------------------------------------------------------------------

-- Today in the player's own timezone (the System's profiles.timezone)
create or replace function public.ascend_today(p_user uuid)
returns date
language sql stable security definer
set search_path = ''
as $$
  select (now() at time zone coalesce(
            (select pr.timezone from public.profiles pr where pr.user_id = p_user), 'UTC'))::date
$$;

create or replace function public.ascend_require_user()
returns uuid
language plpgsql stable
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in to play Ascend' using errcode = '42501';
  end if;
  return uid;
end;
$$;

-- First visit from the chooser screen: create the player's default stats,
-- sub-skills and Golden Tickets. Safe to call every time; it only seeds once.
create or replace function public.ascend_enroll()
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare uid uuid := public.ascend_require_user();
begin
  insert into public.ascend_profiles (user_id) values (uid) on conflict do nothing;
  if not found then
    return false;   -- already enrolled
  end if;

  insert into public.ascend_stats (user_id, id, name, icon, color, position) values
    (uid, 'knowledge',  'Knowledge',         '🧠', 'blue',   0),
    (uid, 'fitness',    'Fitness',           '💪', 'green',  1),
    (uid, 'money',      'Money',             '💰', 'teal',   2),
    (uid, 'discipline', 'Discipline',        '🎯', 'amber',  3),
    (uid, 'social',     'Social',            '🗣️', 'rose',   4),
    (uid, 'creativity', 'Creativity',        '🎨', 'violet', 5),
    (uid, 'emotional',  'Emotional control', '🧘', 'indigo', 6);

  insert into public.ascend_subskills (user_id, id, stat_id, name, position) values
    (uid, 'knowledge.reading',        'knowledge',  'Reading', 0),
    (uid, 'knowledge.languages',      'knowledge',  'Languages', 1),
    (uid, 'knowledge.cfe',            'knowledge',  'Fraud Examination', 2),
    (uid, 'knowledge.critical',       'knowledge',  'Critical thinking', 3),
    (uid, 'fitness.strength',         'fitness',    'Strength', 0),
    (uid, 'fitness.endurance',        'fitness',    'Endurance', 1),
    (uid, 'fitness.nutrition',        'fitness',    'Nutrition', 2),
    (uid, 'fitness.recovery',         'fitness',    'Recovery', 3),
    (uid, 'money.saving',             'money',      'Saving', 0),
    (uid, 'money.business',           'money',      'Business', 1),
    (uid, 'money.property',           'money',      'Property', 2),
    (uid, 'money.investing',          'money',      'Investing', 3),
    (uid, 'discipline.focus',         'discipline', 'Focus', 0),
    (uid, 'discipline.consistency',   'discipline', 'Consistency', 1),
    (uid, 'discipline.time',          'discipline', 'Time management', 2),
    (uid, 'discipline.delayed',       'discipline', 'Delayed gratification', 3),
    (uid, 'social.communication',     'social',     'Communication', 0),
    (uid, 'social.listening',         'social',     'Listening', 1),
    (uid, 'social.speaking',          'social',     'Public speaking', 2),
    (uid, 'social.relationships',     'social',     'Relationships', 3),
    (uid, 'creativity.webdesign',     'creativity', 'Web design', 0),
    (uid, 'creativity.building',      'creativity', 'Building / coding', 1),
    (uid, 'creativity.writing',       'creativity', 'Writing', 2),
    (uid, 'creativity.design',        'creativity', 'Design', 3),
    (uid, 'emotional.stoic',          'emotional',  'Stoic practice', 0),
    (uid, 'emotional.reflection',     'emotional',  'Reflection', 1),
    (uid, 'emotional.stress',         'emotional',  'Stress management', 2),
    (uid, 'emotional.patience',       'emotional',  'Patience', 3);

  insert into public.ascend_tickets (user_id, xp, title) values
    (uid,   500, 'Movie night'),
    (uid,  1000, 'Buy something I''ve been saving for'),
    (uid,  2500, 'Dinner out at a great restaurant'),
    (uid,  5000, 'Weekend staycation'),
    (uid, 10000, 'Bigger trip or experience');

  return true;
end;
$$;

-- Complete a daily or side quest. With p_minutes it logs a Focus Timer
-- session instead: 1 XP per minute, capped at 120. A focus session on a
-- daily that isn't done yet counts as that day's completion.
create or replace function public.ascend_complete_quest(p_quest uuid, p_minutes int default null)
returns public.ascend_completions
language plpgsql security definer
set search_path = ''
as $$
declare
  uid   uuid := public.ascend_require_user();
  q     public.ascend_quests;
  c     public.ascend_completions;
  today date := public.ascend_today(uid);
  v_xp  int;
  v_kind text;
begin
  select * into q from public.ascend_quests where id = p_quest and user_id = uid;
  if not found then
    raise exception 'Quest not found' using errcode = 'P0002';
  end if;
  if q.type = 'main' then
    raise exception 'Main quests are completed one milestone at a time' using errcode = '22023';
  end if;

  if p_minutes is not null then
    if p_minutes < 1 then
      raise exception 'Focus for at least a minute to earn XP' using errcode = '22023';
    end if;
    v_xp := least(120, p_minutes);
    v_kind := 'focus';
    if q.type = 'daily'
       and extract(dow from today)::smallint = any(q.days)
       and not exists (select 1 from public.ascend_completions
                        where quest_id = q.id and local_date = today and kind = 'daily') then
      v_kind := 'daily';
    end if;
  else
    if q.type = 'side' and q.done_at is not null then
      raise exception 'Already done' using errcode = '23505';
    end if;
    if q.type = 'daily' and not (extract(dow from today)::smallint = any(q.days)) then
      raise exception 'This quest isn''t scheduled today' using errcode = '22023';
    end if;
    v_xp := q.xp;
    v_kind := q.type;
  end if;

  begin
    insert into public.ascend_completions (user_id, kind, quest_id, title, stat_id, sub_id, xp, minutes, local_date)
    values (uid, v_kind, q.id, q.title, q.stat_id, q.sub_id, v_xp, least(p_minutes, 600), today)
    returning * into c;
  exception when unique_violation then
    raise exception 'Already done today' using errcode = '23505';
  end;

  if q.type = 'side' and p_minutes is null then
    update public.ascend_quests set done_at = today where id = q.id;
  end if;
  return c;
end;
$$;

-- Tick a milestone (awards its XP) or reopen it (removes that XP again).
-- Returns the new completion, or null when reopened.
create or replace function public.ascend_toggle_milestone(p_milestone uuid)
returns public.ascend_completions
language plpgsql security definer
set search_path = ''
as $$
declare
  uid   uuid := public.ascend_require_user();
  m     public.ascend_milestones;
  q     public.ascend_quests;
  c     public.ascend_completions;
  today date := public.ascend_today(uid);
begin
  select * into m from public.ascend_milestones where id = p_milestone and user_id = uid for update;
  if not found then
    raise exception 'Milestone not found' using errcode = 'P0002';
  end if;
  select * into q from public.ascend_quests where id = m.quest_id;

  if m.done_at is not null then
    update public.ascend_milestones set done_at = null where id = m.id;
    delete from public.ascend_completions where milestone_id = m.id;
    return null;
  end if;

  update public.ascend_milestones set done_at = today where id = m.id;
  insert into public.ascend_completions (user_id, kind, quest_id, milestone_id, title, parent_title, stat_id, sub_id, xp, local_date)
  values (uid, 'milestone', q.id, m.id, m.title, q.title, q.stat_id, q.sub_id, m.xp, today)
  returning * into c;
  return c;
end;
$$;

create or replace function public.ascend_defeat_boss(p_boss uuid)
returns public.ascend_completions
language plpgsql security definer
set search_path = ''
as $$
declare
  uid   uuid := public.ascend_require_user();
  b     public.ascend_bosses;
  c     public.ascend_completions;
  today date := public.ascend_today(uid);
begin
  select * into b from public.ascend_bosses where id = p_boss and user_id = uid for update;
  if not found then
    raise exception 'Boss not found' using errcode = 'P0002';
  end if;
  if b.defeated_at is not null then
    raise exception 'Already defeated' using errcode = '23505';
  end if;
  update public.ascend_bosses set defeated_at = today where id = b.id;
  insert into public.ascend_completions (user_id, kind, boss_id, title, stat_id, sub_id, xp, local_date)
  values (uid, 'boss', b.id, b.title, b.stat_id, b.sub_id, b.xp, today)
  returning * into c;
  return c;
end;
$$;

-- Weekly review: one per Monday–Sunday week, +50 XP to Emotional control · Reflection
create or replace function public.ascend_submit_review(
  p_wins text, p_slipped text, p_focus_stat text, p_stoic text)
returns public.ascend_completions
language plpgsql security definer
set search_path = ''
as $$
declare
  uid     uuid := public.ascend_require_user();
  today   date := public.ascend_today(uid);
  v_week  date := today - (extract(isodow from today)::int - 1);
  v_stat  text;
  v_sub   text;
  r_id    uuid;
  c       public.ascend_completions;
begin
  if coalesce(btrim(p_wins), '') = '' and coalesce(btrim(p_slipped), '') = '' and coalesce(btrim(p_stoic), '') = '' then
    raise exception 'Write a line or two in at least one box' using errcode = '22023';
  end if;

  select id into v_stat from public.ascend_stats where user_id = uid and id = 'emotional';
  if v_stat is null then
    select id into v_stat from public.ascend_stats where user_id = uid order by position limit 1;
  end if;
  select id into v_sub from public.ascend_subskills where user_id = uid and id = 'emotional.reflection';

  begin
    insert into public.ascend_reviews (user_id, local_date, week_start, wins, slipped, focus_stat, stoic)
    values (uid, today, v_week, left(coalesce(p_wins, ''), 4000), left(coalesce(p_slipped, ''), 4000),
            p_focus_stat, left(coalesce(p_stoic, ''), 4000))
    returning id into r_id;
  exception when unique_violation then
    raise exception 'This week''s review is already done' using errcode = '23505';
  end;

  insert into public.ascend_completions (user_id, kind, review_id, title, stat_id, sub_id, xp, local_date)
  values (uid, 'review', r_id, 'Weekly review', v_stat, v_sub, 50, today)
  returning * into c;
  return c;
end;
$$;

-- Claim a Golden Ticket once lifetime XP has reached it (or un-claim it)
create or replace function public.ascend_claim_ticket(p_ticket uuid, p_claim boolean default true)
returns public.ascend_tickets
language plpgsql security definer
set search_path = ''
as $$
declare
  uid   uuid := public.ascend_require_user();
  t     public.ascend_tickets;
  total bigint;
begin
  select * into t from public.ascend_tickets where id = p_ticket and user_id = uid for update;
  if not found then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
  if p_claim then
    select coalesce(sum(xp), 0) into total from public.ascend_completions where user_id = uid;
    if total < t.xp then
      raise exception '% XP to go before this ticket unlocks', t.xp - total using errcode = '22023';
    end if;
    update public.ascend_tickets set claimed_at = coalesce(claimed_at, public.ascend_today(uid))
     where id = t.id returning * into t;
  else
    update public.ascend_tickets set claimed_at = null where id = t.id returning * into t;
  end if;
  return t;
end;
$$;

-- Undo a completion (the 5-second undo, or fixing a mis-tap later).
-- Reverts whatever the completion marked as done.
create or replace function public.ascend_remove_completion(p_completion uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := public.ascend_require_user();
  c   public.ascend_completions;
begin
  delete from public.ascend_completions where id = p_completion and user_id = uid returning * into c;
  if not found then
    raise exception 'Entry not found' using errcode = 'P0002';
  end if;
  if c.kind = 'side' and c.quest_id is not null then
    update public.ascend_quests set done_at = null where id = c.quest_id and user_id = uid;
  elsif c.kind = 'milestone' and c.milestone_id is not null then
    update public.ascend_milestones set done_at = null where id = c.milestone_id and user_id = uid;
  elsif c.kind = 'boss' and c.boss_id is not null then
    update public.ascend_bosses set defeated_at = null where id = c.boss_id and user_id = uid;
  elsif c.kind = 'review' and c.review_id is not null then
    delete from public.ascend_reviews where id = c.review_id and user_id = uid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Row level security: every row belongs to exactly one player
-- ---------------------------------------------------------------------
alter table public.ascend_profiles    enable row level security;
alter table public.ascend_stats       enable row level security;
alter table public.ascend_subskills   enable row level security;
alter table public.ascend_quests      enable row level security;
alter table public.ascend_milestones  enable row level security;
alter table public.ascend_bosses      enable row level security;
alter table public.ascend_tickets     enable row level security;
alter table public.ascend_reviews     enable row level security;
alter table public.ascend_completions enable row level security;

create policy ascend_profiles_own   on public.ascend_profiles   for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ascend_stats_own      on public.ascend_stats      for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ascend_subskills_own  on public.ascend_subskills  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ascend_quests_own     on public.ascend_quests     for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ascend_bosses_own     on public.ascend_bosses     for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ascend_tickets_own    on public.ascend_tickets    for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ascend_milestones_own on public.ascend_milestones for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id
              and exists (select 1 from public.ascend_quests q
                           where q.id = quest_id and q.user_id = (select auth.uid()) and q.type = 'main'));
create policy ascend_reviews_read     on public.ascend_reviews     for select to authenticated
  using ((select auth.uid()) = user_id);
create policy ascend_completions_read on public.ascend_completions for select to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- Grants: read everything you own; write only the columns that don't
-- carry XP state. done_at / defeated_at / claimed_at and the ledger are
-- written by the functions above.
-- ---------------------------------------------------------------------
revoke all on public.ascend_profiles, public.ascend_stats, public.ascend_subskills,
              public.ascend_quests, public.ascend_milestones, public.ascend_bosses,
              public.ascend_tickets, public.ascend_reviews, public.ascend_completions,
              public.ascend_player, public.ascend_stat_xp, public.ascend_subskill_xp
  from anon, authenticated;

grant select on public.ascend_profiles, public.ascend_stats, public.ascend_subskills,
                public.ascend_quests, public.ascend_milestones, public.ascend_bosses,
                public.ascend_tickets, public.ascend_reviews, public.ascend_completions,
                public.ascend_player, public.ascend_stat_xp, public.ascend_subskill_xp
  to authenticated;

grant update (settings)                        on public.ascend_profiles  to authenticated;
grant update (name, icon, color, position)     on public.ascend_stats     to authenticated;
grant insert (user_id, id, stat_id, name, note, position),
      update (name, note, position), delete    on public.ascend_subskills to authenticated;
grant insert (user_id, type, title, stat_id, sub_id, xp, days, timed, due, target),
      update (title, stat_id, sub_id, xp, days, timed, due, target, archived),
      delete                                   on public.ascend_quests    to authenticated;
grant insert (user_id, quest_id, title, xp, position),
      update (title, xp, position), delete     on public.ascend_milestones to authenticated;
grant insert (user_id, title, stat_id, sub_id, xp, avoiding_since, why),
      update (title, stat_id, sub_id, xp, avoiding_since, why),
      delete                                   on public.ascend_bosses    to authenticated;
grant insert (user_id, xp, title),
      update (xp, title), delete               on public.ascend_tickets   to authenticated;

-- Functions: Supabase grants EXECUTE to anon/authenticated by default; close that first.
revoke execute on function
  public.ascend_xp_for_level(int), public.ascend_level_from_xp(bigint),
  public.ascend_today(uuid), public.ascend_require_user(), public.ascend_enforce_daily_cap(),
  public.ascend_enroll(), public.ascend_complete_quest(uuid, int), public.ascend_toggle_milestone(uuid),
  public.ascend_defeat_boss(uuid), public.ascend_submit_review(text, text, text, text),
  public.ascend_claim_ticket(uuid, boolean), public.ascend_remove_completion(uuid)
  from public, anon, authenticated;

grant execute on function
  public.ascend_xp_for_level(int), public.ascend_level_from_xp(bigint), public.ascend_require_user(),
  public.ascend_enroll(), public.ascend_complete_quest(uuid, int), public.ascend_toggle_milestone(uuid),
  public.ascend_defeat_boss(uuid), public.ascend_submit_review(text, text, text, text),
  public.ascend_claim_ticket(uuid, boolean), public.ascend_remove_completion(uuid)
  to authenticated;
