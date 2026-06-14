-- ═══════════════════════════════════════════════════════════════════════════
-- 0013_skills.sql — PHASE 7, part 4: Skills (passive + active)
--
-- Essence-purchased abilities. Catalog + effects live in progression.ts
-- (SKILLS); the edge function validates prereqs/essence on unlock and
-- cooldown/mana on use. Passives fold into the XP/stat/mana math; actives
-- have an immediate effect and stamp last_used_at for cooldown tracking.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.skills (
  user_id      uuid not null references auth.users(id) on delete cascade,
  skill_key    text not null,
  unlocked_at  timestamptz not null default now(),
  last_used_at date,
  primary key (user_id, skill_key)
);

alter table public.skills enable row level security;
create policy "skills_select_own" on public.skills
  for select using (auth.uid() = user_id);

-- Clients read their unlocked skills; only the service role writes them.
grant select on public.skills to authenticated;
