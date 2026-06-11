-- ═══════════════════════════════════════════════════════════════════════════
-- BACKFILL — run AFTER 0001_core.sql, only if auth.users already has
-- accounts from the old app.
--
-- The awakening trigger only fires for NEW signups; pre-existing accounts
-- need their player rows created manually. Idempotent (safe to re-run).
-- Everyone starts at Level 1 / E-Rank with the journey beginning today.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.profiles (user_id, display_name)
select
  u.id,
  coalesce(
    u.raw_user_meta_data ->> 'display_name',
    u.raw_user_meta_data ->> 'hunter_name',
    'Player'
  )
from auth.users u
on conflict (user_id) do nothing;

insert into public.stats (user_id, stat)
select u.id, s
from auth.users u
cross join unnest(array['STR','END','AGI','INT','WIS','STA','WIL','DIS','CHA']) as s
on conflict (user_id, stat) do nothing;

insert into public.training_totals (user_id)
select id from auth.users
on conflict (user_id) do nothing;

insert into public.system_messages (user_id, kind, title, body)
select
  u.id,
  'awakening',
  'You have acquired the qualifications to be a Player.',
  'The System has bound itself to you. Your transformation begins now. Complete your Daily Training Quest to earn experience. There are no shortcuts.'
from auth.users u
where not exists (
  select 1 from public.system_messages m
  where m.user_id = u.id and m.kind = 'awakening'
);
