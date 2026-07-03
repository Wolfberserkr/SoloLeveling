-- ═══════════════════════════════════════════════════════════════════════════
-- 0022_event_slots.sql — System Events once or twice a day
--
-- system_events grows a slot column: slot 1 is the guaranteed daily event,
-- slot 2 the afternoon coin flip. Existing rows become slot 1. The old
-- one-per-day unique gives way to one-per-day-per-slot.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.system_events
  add column slot smallint not null default 1 check (slot between 1 and 2);

alter table public.system_events
  drop constraint system_events_user_id_local_date_key;

alter table public.system_events
  add constraint system_events_user_date_slot_key unique (user_id, local_date, slot);
