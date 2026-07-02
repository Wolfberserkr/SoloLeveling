-- ═══════════════════════════════════════════════════════════════════════════
-- 0021_calories.sql — Fuel Protocol: the calorie ceiling
--
-- Completes the cut-tracking loop: protein is the floor (XP-gated, 0020),
-- calories are the ceiling. Purely informational — no XP rides on it, since
-- rewarding "eating less" is the wrong incentive to gamify. The ceiling is
-- player-editable like the protein target (self-reported honor system);
-- intake accumulates server-side in the same nutrition_logs row.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column calorie_target_kcal int not null default 2200
    check (calorie_target_kcal between 1200 and 6000);

grant update (calorie_target_kcal) on public.profiles to authenticated;

alter table public.nutrition_logs
  add column calories_kcal int not null default 0;
