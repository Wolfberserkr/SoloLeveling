import { getAdminSupabase } from './supabase/admin';

export type PowerUpDef = {
  key: string;
  name: string;
  description: string;
  effect: string;
  durationMs?: number;
  icon: string;
};

export const POWER_UPS: PowerUpDef[] = [
  {
    key: 'essence_stone',
    name: 'Essence Stone',
    description: 'A fragment of mana crystallised from a cleared daily quest.',
    effect: 'Spend 3 to instantly gain a +1 stat point.',
    icon: '◆',
  },
  {
    key: 'elixir_of_life',
    name: 'Elixir of Life',
    description: "Restores the Hunter's mana pool.",
    effect: 'Refills mana to 100. (Single use.)',
    icon: '⚗',
  },
  {
    key: 'rune_of_focus',
    name: 'Rune of Focus',
    description: 'Sharpens the System UI for the next dungeon run.',
    effect: 'Next workout grants +50% XP. Lasts 2 hours.',
    durationMs: 2 * 60 * 60 * 1000,
    icon: '✺',
  },
  {
    key: 'shadow_extraction',
    name: 'Shadow Extraction',
    description: 'Earned by clearing a deload week. Permanently boosts a stat by +2.',
    effect: 'Use to add +2 to the stat of your choice.',
    icon: '☽',
  },
];

export function getDef(key: string) {
  return POWER_UPS.find((p) => p.key === key);
}

export async function inventory(
  userId: string
): Promise<{ def: PowerUpDef; quantity: number }[]> {
  const sb = getAdminSupabase();
  const { data } = await sb
    .from('power_ups')
    .select('power_up_key, quantity')
    .eq('user_id', userId)
    .gt('quantity', 0);
  return (data || [])
    .map((r: any) => ({ def: getDef(r.power_up_key)!, quantity: r.quantity }))
    .filter((x) => x.def);
}

export async function grant(userId: string, key: string, quantity = 1) {
  const sb = getAdminSupabase();
  const { data: existing } = await sb
    .from('power_ups')
    .select('quantity')
    .eq('user_id', userId)
    .eq('power_up_key', key)
    .maybeSingle();
  await sb.from('power_ups').upsert(
    { user_id: userId, power_up_key: key, quantity: (existing?.quantity || 0) + quantity },
    { onConflict: 'user_id,power_up_key' }
  );
}

export async function consume(userId: string, key: string, quantity = 1): Promise<boolean> {
  const sb = getAdminSupabase();
  const { data: row } = await sb
    .from('power_ups')
    .select('quantity')
    .eq('user_id', userId)
    .eq('power_up_key', key)
    .maybeSingle();
  if (!row || row.quantity < quantity) return false;
  await sb
    .from('power_ups')
    .update({ quantity: row.quantity - quantity })
    .eq('user_id', userId)
    .eq('power_up_key', key);
  return true;
}

export async function activeBuffs(userId: string) {
  const sb = getAdminSupabase();
  const nowIso = new Date().toISOString();
  await sb.from('active_buffs').delete().lt('expires_at', nowIso);
  const { data } = await sb
    .from('active_buffs')
    .select('buff_key, expires_at')
    .eq('user_id', userId);
  return data || [];
}

export async function applyPowerUp(
  userId: string,
  key: string,
  target?: 'str' | 'agi' | 'vit' | 'int_' | 'per'
): Promise<{ ok: boolean; message: string }> {
  const sb = getAdminSupabase();
  const def = getDef(key);
  if (!def) return { ok: false, message: 'Unknown item.' };

  if (key === 'essence_stone') {
    const { data: row } = await sb
      .from('power_ups')
      .select('quantity')
      .eq('user_id', userId)
      .eq('power_up_key', key)
      .maybeSingle();
    if (!row || row.quantity < 3) return { ok: false, message: 'Need 3 Essence Stones.' };
    await consume(userId, key, 3);
    const { data: stats } = await sb
      .from('hunter_stats')
      .select('stat_points')
      .eq('user_id', userId)
      .single();
    await sb
      .from('hunter_stats')
      .update({ stat_points: (stats?.stat_points || 0) + 1 })
      .eq('user_id', userId);
    return { ok: true, message: '+1 stat point.' };
  }
  if (key === 'elixir_of_life') {
    if (!(await consume(userId, key, 1))) return { ok: false, message: 'None in inventory.' };
    await sb.from('hunter_stats').update({ mana: 100 }).eq('user_id', userId);
    return { ok: true, message: 'Mana fully restored.' };
  }
  if (key === 'rune_of_focus') {
    if (!(await consume(userId, key, 1))) return { ok: false, message: 'None in inventory.' };
    await sb.from('active_buffs').insert({
      user_id: userId,
      buff_key: 'xp_x1_5',
      expires_at: new Date(Date.now() + (def.durationMs || 7200000)).toISOString(),
    });
    return { ok: true, message: 'Rune of Focus activated. +50% XP for 2h.' };
  }
  if (key === 'shadow_extraction') {
    if (!target) return { ok: false, message: 'Choose a stat to enhance.' };
    if (!(await consume(userId, key, 1))) return { ok: false, message: 'None in inventory.' };
    const { data: stats } = await sb
      .from('hunter_stats')
      .select(target as any)
      .eq('user_id', userId)
      .single();
    const cur = Number((stats as any)?.[target] || 0);
    await sb
      .from('hunter_stats')
      .update({ [target]: cur + 2 })
      .eq('user_id', userId);
    return { ok: true, message: `+2 ${target.replace('_', '')}.` };
  }
  return { ok: false, message: 'No effect defined.' };
}
