// ─────────────────────────────────────────────────────────────────────────────
// ITEMS — the loot catalog for Random Encounters.
//
// Two categories:
//   • consumable — a one-shot effect spent from the inventory (mana, essence,
//                  XP, fatigue purge).
//   • gear       — equipped to multiply ONE attribute's gains for a limited
//                  time, then it expires. Gear is consumed on equip.
//
// The catalog is code, not a table (like SKILLS/TITLES): balance lives in
// version control and is unit-testable. The DB only tracks per-user ownership
// (inventory) and equipped state (equipment).
//
// Pure TypeScript, shared client + server. No Deno/Node/DOM.
// ─────────────────────────────────────────────────────────────────────────────
import type { StatKey } from './constants.ts';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';

/** Drop weighting — commoner items fall more often. */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 50,
  uncommon: 30,
  rare: 15,
  epic: 5,
};

export type ConsumableEffect =
  | { kind: 'mana'; amount: number }
  | { kind: 'essence'; amount: number }
  | { kind: 'xp'; amount: number }
  | { kind: 'fatigue_purge' }
  | { kind: 'streak_shield' };

export type ItemDef = {
  key: string;
  name: string;
  description: string;
  rarity: Rarity;
  category: 'consumable' | 'gear';
  // consumable only:
  effect?: ConsumableEffect;
  /** Consumed automatically by the System, never from a Use button. */
  autoConsume?: boolean;
  // gear only:
  affinity?: StatKey;
  statMult?: number;
  durationHours?: number;
  /** Never falls as random loot — granted only by a specific System event
   *  (e.g. the Spartan Protocol capstone). Kept out of the drop pools. */
  exclusive?: boolean;
};

/** The Shield item key — earned insurance that auto-saves a broken streak. */
export const STREAK_SHIELD_KEY = 'shield_of_resolve';

export const ITEMS: Record<string, ItemDef> = {
  // ── Consumables ──
  mana_draught: {
    key: 'mana_draught',
    name: 'Mana Draught',
    description: 'Restores 30 mana when drunk.',
    rarity: 'common',
    category: 'consumable',
    effect: { kind: 'mana', amount: 30 },
  },
  xp_token: {
    key: 'xp_token',
    name: 'Experience Sigil',
    description: 'Grants 50 XP when used (still bound by the daily cap).',
    rarity: 'uncommon',
    category: 'consumable',
    effect: { kind: 'xp', amount: 50 },
  },
  cleansing_water: {
    key: 'cleansing_water',
    name: 'Cleansing Water',
    description: 'Purges all accumulated fatigue.',
    rarity: 'uncommon',
    category: 'consumable',
    effect: { kind: 'fatigue_purge' },
  },
  essence_shard: {
    key: 'essence_shard',
    name: 'Essence Shard',
    description: 'Crystallized power — yields 3 Essence Stones when shattered.',
    rarity: 'rare',
    category: 'consumable',
    effect: { kind: 'essence', amount: 3 },
  },
  shield_of_resolve: {
    key: STREAK_SHIELD_KEY,
    name: 'Shield of Resolve',
    description:
      'Earned insurance. The System consumes it automatically to preserve your streak the day you miss training. Cannot be bought — only earned.',
    rarity: 'epic',
    category: 'consumable',
    effect: { kind: 'streak_shield' },
    autoConsume: true,
  },

  // ── Gear (one per attribute) ──
  gauntlet_of_might: {
    key: 'gauntlet_of_might',
    name: 'Gauntlet of Might',
    description: '×1.4 Strength gains for 48h.',
    rarity: 'uncommon',
    category: 'gear',
    affinity: 'STR',
    statMult: 1.4,
    durationHours: 48,
  },
  aegis_of_vigor: {
    key: 'aegis_of_vigor',
    name: 'Aegis of Vigor',
    description: '×1.4 Endurance gains for 48h.',
    rarity: 'uncommon',
    category: 'gear',
    affinity: 'END',
    statMult: 1.4,
    durationHours: 48,
  },
  boots_of_the_gale: {
    key: 'boots_of_the_gale',
    name: 'Boots of the Gale',
    description: '×1.5 Agility gains for 24h.',
    rarity: 'rare',
    category: 'gear',
    affinity: 'AGI',
    statMult: 1.5,
    durationHours: 24,
  },
  tome_of_intellect: {
    key: 'tome_of_intellect',
    name: 'Tome of Intellect',
    description: '×1.5 Intelligence gains for 24h.',
    rarity: 'rare',
    category: 'gear',
    affinity: 'INT',
    statMult: 1.5,
    durationHours: 24,
  },
  eye_of_insight: {
    key: 'eye_of_insight',
    name: 'Eye of Insight',
    description: '×1.5 Wisdom gains for 24h.',
    rarity: 'rare',
    category: 'gear',
    affinity: 'WIS',
    statMult: 1.5,
    durationHours: 24,
  },
  banner_of_stamina: {
    key: 'banner_of_stamina',
    name: 'Banner of Stamina',
    description: '×1.4 Stamina gains for 48h.',
    rarity: 'uncommon',
    category: 'gear',
    affinity: 'STA',
    statMult: 1.4,
    durationHours: 48,
  },
  black_heart: {
    key: 'black_heart',
    name: 'The Black Heart',
    description: '×1.5 Will gains for 24h.',
    rarity: 'epic',
    category: 'gear',
    affinity: 'WIL',
    statMult: 1.5,
    durationHours: 24,
  },
  crown_of_order: {
    key: 'crown_of_order',
    name: 'Crown of Order',
    description: '×1.4 Discipline gains for 48h.',
    rarity: 'uncommon',
    category: 'gear',
    affinity: 'DIS',
    statMult: 1.4,
    durationHours: 48,
  },
  orb_of_avarice: {
    key: 'orb_of_avarice',
    name: 'Orb of Avarice',
    description: '×1.5 Charisma gains for 24h.',
    rarity: 'epic',
    category: 'gear',
    affinity: 'CHA',
    statMult: 1.5,
    durationHours: 24,
  },

  // ── Exclusive artifact — the Spartan Protocol capstone (never dropped) ──
  spartans_aegis: {
    key: 'spartans_aegis',
    name: "Spartan's Aegis",
    description:
      'Forged by clearing the six-month Spartan Protocol. A permanent artifact: ×1.3 Endurance gains, forever. It does not expire.',
    rarity: 'epic',
    category: 'gear',
    affinity: 'END',
    statMult: 1.3,
    exclusive: true,
  },
};

export const CONSUMABLE_KEYS = Object.values(ITEMS)
  .filter((i) => i.category === 'consumable')
  .map((i) => i.key);

/** Consumables that can fall as random loot — excludes earned-only items
 *  (the Shield of Resolve is granted by the System, never dropped). */
export const DROPPABLE_CONSUMABLE_KEYS = Object.values(ITEMS)
  .filter((i) => i.category === 'consumable' && !i.autoConsume)
  .map((i) => i.key);

export const GEAR_KEYS = Object.values(ITEMS)
  .filter((i) => i.category === 'gear')
  .map((i) => i.key);

/** Gear that can fall as random loot — excludes exclusive, granted-only pieces. */
export const DROPPABLE_GEAR_KEYS = Object.values(ITEMS)
  .filter((i) => i.category === 'gear' && !i.exclusive)
  .map((i) => i.key);

export function itemDef(key: string): ItemDef | undefined {
  return ITEMS[key];
}

export function isGear(key: string): boolean {
  return ITEMS[key]?.category === 'gear';
}

export function isConsumable(key: string): boolean {
  return ITEMS[key]?.category === 'consumable';
}

/**
 * Per-attribute multiplier from the player's currently-active gear. Unknown or
 * non-gear keys are ignored; stacking gear on the same attribute multiplies.
 */
export function itemStatMultiplier(activeGearKeys: string[]): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  for (const key of activeGearKeys) {
    const def = ITEMS[key];
    if (!def || def.category !== 'gear' || !def.affinity || !def.statMult) continue;
    out[def.affinity] = (out[def.affinity] ?? 1) * def.statMult;
  }
  return out;
}

/** The effect of a consumable. Throws for unknown keys or non-consumables. */
export function applyConsumable(key: string): ConsumableEffect {
  const def = ITEMS[key];
  if (!def || def.category !== 'consumable' || !def.effect) {
    throw new Error(`Not a consumable: ${key}`);
  }
  return def.effect;
}
