-- ═══════════════════════════════════════════════════════════════════════════
-- 0006_timezone.sql — honor the device timezone captured at signup
--
-- The signup form has always sent the device's IANA timezone in the auth
-- metadata, but handle_new_user ignored it, so every player started on the
-- schema default (Europe/Amsterdam). Validate it (a bad value would break
-- every date computation for the account) and fall back to the default.
-- Existing players fix theirs from the System page — profiles.timezone is
-- one of the two client-writable columns (see 0001).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := coalesce(new.raw_user_meta_data ->> 'timezone', 'Europe/Amsterdam');
begin
  -- Reject unknown IANA names: an invalid timezone would 500 every action.
  begin
    perform now() at time zone v_tz;
  exception when others then
    v_tz := 'Europe/Amsterdam';
  end;

  insert into profiles (user_id, display_name, timezone)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'Player'), v_tz);

  insert into stats (user_id, stat)
  select new.id, s from unnest(array['STR','END','AGI','INT','WIS','STA','WIL','DIS','CHA']) as s;

  insert into training_totals (user_id) values (new.id);
  insert into dungeon_progress (user_id) values (new.id);

  insert into system_messages (user_id, kind, title, body)
  values (
    new.id,
    'awakening',
    'You have acquired the qualifications to be a Player.',
    'The System has bound itself to you. Your transformation begins now. Complete your Daily Training Quest to earn experience. There are no shortcuts.'
  );

  return new;
end;
$$;
