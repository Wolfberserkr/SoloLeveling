-- Phase 2 — Monarch's Skills
-- A skill-tree progression layer. Skills are gated by rank AND cost skill
-- points (earned on level up). Most skills are active abilities that
-- consume mana; a few are always-on passives.

alter table public.hunter_stats
  add column if not exists skill_points int not null default 0;

create table if not exists public.hunter_skills (
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_key text not null,
  unlocked_at timestamptz not null default now(),
  last_used_at timestamptz,
  primary key (user_id, skill_key)
);
create index if not exists idx_hunter_skills_user
  on public.hunter_skills(user_id);

alter table public.hunter_skills enable row level security;
drop policy if exists "own_select_hunter_skills" on public.hunter_skills;
create policy "own_select_hunter_skills" on public.hunter_skills
  for select using (auth.uid() = user_id);
