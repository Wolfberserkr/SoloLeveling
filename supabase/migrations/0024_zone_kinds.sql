-- ═══════════════════════════════════════════════════════════════════════════
-- 0024_zone_kinds.sql — more Field Zone kinds: home, work, park, trail
--
-- home (Sanctuary) pays a mana blessing once the Daily Quest is complete;
-- work (Duty Post) spawns mental trials; park (Hunting Grounds) spawns
-- cardio monsters; trail (Treasure Trail) pays gear-biased loot + Essence.
-- zone_triggers gains the 'blessing' outcome for the hearth.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.zones
  drop constraint zones_kind_check;
alter table public.zones
  add constraint zones_kind_check
  check (kind in ('gym','store','landmark','home','work','park','trail'));

alter table public.zone_triggers
  drop constraint zone_triggers_kind_check;
alter table public.zone_triggers
  add constraint zone_triggers_kind_check
  check (kind in ('fight','cache','treasure','blessing','quiet'));
