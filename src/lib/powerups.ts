import { getDb } from './db';

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

export function inventory(userId: number): { def: PowerUpDef; quantity: number }[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT power_up_key, quantity FROM power_ups WHERE user_id = ? AND quantity > 0')
    .all(userId) as any[];
  return rows
    .map((r) => ({ def: getDef(r.power_up_key)!, quantity: r.quantity }))
    .filter((x) => x.def);
}

export function grant(userId: number, key: string, quantity = 1) {
  const db = getDb();
  db.prepare(
    `INSERT INTO power_ups (user_id, power_up_key, quantity) VALUES (?,?,?)
     ON CONFLICT(user_id, power_up_key) DO UPDATE SET quantity = quantity + excluded.quantity`
  ).run(userId, key, quantity);
}

export function consume(userId: number, key: string, quantity = 1): boolean {
  const db = getDb();
  const row = db
    .prepare('SELECT quantity FROM power_ups WHERE user_id = ? AND power_up_key = ?')
    .get(userId, key) as any;
  if (!row || row.quantity < quantity) return false;
  db.prepare('UPDATE power_ups SET quantity = quantity - ? WHERE user_id = ? AND power_up_key = ?').run(
    quantity,
    userId,
    key
  );
  return true;
}

export function activeBuffs(userId: number): { buff_key: string; expires_at: number }[] {
  const db = getDb();
  db.prepare('DELETE FROM active_buffs WHERE expires_at < ?').run(Date.now());
  return db
    .prepare('SELECT buff_key, expires_at FROM active_buffs WHERE user_id = ?')
    .all(userId) as any[];
}

export function applyPowerUp(
  userId: number,
  key: string,
  target?: 'str' | 'agi' | 'vit' | 'int_' | 'per'
): { ok: true; message: string } | { ok: false; message: string } {
  const db = getDb();
  const def = getDef(key);
  if (!def) return { ok: false, message: 'Unknown item.' };

  if (key === 'essence_stone') {
    const row = db
      .prepare('SELECT quantity FROM power_ups WHERE user_id = ? AND power_up_key = ?')
      .get(userId, key) as any;
    if (!row || row.quantity < 3) return { ok: false, message: 'Need 3 Essence Stones.' };
    consume(userId, key, 3);
    db.prepare('UPDATE hunter_stats SET stat_points = stat_points + 1 WHERE user_id = ?').run(userId);
    return { ok: true, message: '+1 stat point.' };
  }
  if (key === 'elixir_of_life') {
    if (!consume(userId, key, 1)) return { ok: false, message: 'None in inventory.' };
    db.prepare('UPDATE hunter_stats SET mana = 100 WHERE user_id = ?').run(userId);
    return { ok: true, message: 'Mana fully restored.' };
  }
  if (key === 'rune_of_focus') {
    if (!consume(userId, key, 1)) return { ok: false, message: 'None in inventory.' };
    db.prepare('INSERT INTO active_buffs (user_id, buff_key, expires_at) VALUES (?,?,?)').run(
      userId,
      'xp_x1_5',
      Date.now() + (def.durationMs || 7200000)
    );
    return { ok: true, message: 'Rune of Focus activated. +50% XP for 2h.' };
  }
  if (key === 'shadow_extraction') {
    if (!target) return { ok: false, message: 'Choose a stat to enhance.' };
    if (!consume(userId, key, 1)) return { ok: false, message: 'None in inventory.' };
    db.prepare(`UPDATE hunter_stats SET ${target} = ${target} + 2 WHERE user_id = ?`).run(userId);
    return { ok: true, message: `+2 ${target.replace('_', '')}.` };
  }
  return { ok: false, message: 'No effect defined.' };
}
