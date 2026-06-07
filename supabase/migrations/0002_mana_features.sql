-- Add mana feature columns to hunter_stats.
-- Run in Supabase SQL Editor after the initial migration.

alter table public.hunter_stats
  add column if not exists last_penalty_check date,
  add column if not exists last_meditate_date date;
