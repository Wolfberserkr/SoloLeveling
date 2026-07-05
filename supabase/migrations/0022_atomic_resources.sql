-- ═══════════════════════════════════════════════════════════════════════════
-- 0022 — atomic resource mutations (audit phase B).
--
-- Mana / potion / essence spends were read-modify-write in the edge function:
-- two concurrent actions could each read the same balance and both "afford"
-- a spend, losing one deduction. spend_resources moves the check and the
-- write into one guarded UPDATE. Positive amounts spend, negative amounts
-- grant (mana grants clamp to mana_max); NULL return = insufficient funds,
-- nothing changed.
--
-- award_xp is also recreated to take the profile row lock BEFORE summing the
-- daily cap, so concurrent awards serialize and can no longer overshoot the
-- 300 XP/day ceiling.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.spend_resources(
  p_user uuid,
  p_mana int default 0,
  p_potions int default 0,
  p_essence int default 0,
  p_explores int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mana int;
  v_potions int;
  v_essence int;
  v_explores int;
begin
  update profiles
  set mana = least(mana_max, greatest(0, mana - p_mana)),
      mana_potions = mana_potions - p_potions,
      essence_stones = essence_stones - p_essence,
      explores_today = explores_today + p_explores
  where user_id = p_user
    and mana >= p_mana
    and mana_potions >= p_potions
    and essence_stones >= p_essence
  returning mana, mana_potions, essence_stones, explores_today
    into v_mana, v_potions, v_essence, v_explores;

  if not found then
    return null; -- insufficient funds; nothing changed
  end if;

  return jsonb_build_object(
    'mana', v_mana,
    'mana_potions', v_potions,
    'essence_stones', v_essence,
    'explores_today', v_explores
  );
end;
$$;

revoke execute on function public.spend_resources from public, anon, authenticated;
grant execute on function public.spend_resources to service_role;

-- award_xp: identical contract to 0001, but the profile lock now precedes the
-- cap computation so concurrent awards for one user serialize.
create or replace function public.award_xp(
  p_user uuid,
  p_amount int,
  p_source text,
  p_source_ref uuid,
  p_cap_eligible boolean,
  p_local_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spent_today int;
  v_credited int := p_amount;
  v_old_level int;
  v_new_level int;
  v_new_total bigint;
begin
  if p_amount < 0 then
    raise exception 'negative XP award';
  end if;

  -- Serialize per-user awards before reading the ledger, or two concurrent
  -- awards both see the same "spent today" and overshoot the daily cap.
  select level into v_old_level from profiles where user_id = p_user for update;

  if p_cap_eligible then
    select coalesce(sum(credited), 0) into v_spent_today
    from xp_ledger
    where user_id = p_user and local_date = p_local_date and cap_eligible;
    v_credited := greatest(0, least(p_amount, 300 - v_spent_today));
  end if;

  insert into xp_ledger (user_id, amount, credited, source, source_ref, cap_eligible, local_date)
  values (p_user, p_amount, v_credited, p_source, p_source_ref, p_cap_eligible, p_local_date);

  update profiles
  set xp_total = xp_total + v_credited
  where user_id = p_user
  returning xp_total into v_new_total;

  v_new_level := public.level_from_xp(v_new_total);

  if v_new_level <> v_old_level then
    update profiles set level = v_new_level where user_id = p_user;
  end if;

  return jsonb_build_object(
    'amount', p_amount,
    'credited', v_credited,
    'capped', v_credited < p_amount,
    'xp_total', v_new_total,
    'old_level', v_old_level,
    'new_level', v_new_level,
    'leveled_up', v_new_level > v_old_level
  );
end;
$$;

revoke execute on function public.award_xp from public, anon, authenticated;
grant execute on function public.award_xp to service_role;
