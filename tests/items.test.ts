import { describe, it, expect } from 'vitest';
import {
  ITEMS,
  CONSUMABLE_KEYS,
  GEAR_KEYS,
  RARITY_WEIGHT,
  itemStatMultiplier,
  applyConsumable,
  isGear,
  isConsumable,
} from '@game/items.ts';
import { STATS } from '@game/constants.ts';

describe('item catalog integrity', () => {
  it('keys match their map entries', () => {
    for (const [key, def] of Object.entries(ITEMS)) expect(def.key).toBe(key);
  });

  it('every gear has an affinity stat and a multiplier > 1', () => {
    for (const key of GEAR_KEYS) {
      const def = ITEMS[key];
      expect(def.category).toBe('gear');
      expect(STATS).toContain(def.affinity);
      expect(def.statMult).toBeGreaterThan(1);
    }
  });

  it('temporary gear expires; only exclusive artifacts are permanent', () => {
    for (const key of GEAR_KEYS) {
      const def = ITEMS[key];
      if (def.exclusive) {
        // Permanent artifacts carry no duration — permanence is applied at grant.
        expect(def.durationHours).toBeUndefined();
      } else {
        expect(def.durationHours).toBeGreaterThan(0);
      }
    }
  });

  it('covers all nine attributes with gear', () => {
    const covered = new Set(GEAR_KEYS.map((k) => ITEMS[k].affinity));
    for (const stat of STATS) expect(covered).toContain(stat);
  });

  it('every consumable has an effect with a sane amount', () => {
    for (const key of CONSUMABLE_KEYS) {
      const def = ITEMS[key];
      expect(def.category).toBe('consumable');
      expect(def.effect).toBeDefined();
      const effect = def.effect!;
      // Amount-bearing effects must be plausible; effect-only kinds
      // (fatigue_purge, streak_shield) carry no amount.
      if ('amount' in effect) {
        expect(effect.amount).toBeGreaterThan(0);
        expect(effect.amount).toBeLessThanOrEqual(100);
      }
    }
  });

  it('rarity weights are all positive', () => {
    for (const w of Object.values(RARITY_WEIGHT)) expect(w).toBeGreaterThan(0);
  });

  it('category guards agree with the catalog', () => {
    for (const key of GEAR_KEYS) {
      expect(isGear(key)).toBe(true);
      expect(isConsumable(key)).toBe(false);
    }
    for (const key of CONSUMABLE_KEYS) {
      expect(isConsumable(key)).toBe(true);
      expect(isGear(key)).toBe(false);
    }
  });
});

describe('itemStatMultiplier', () => {
  it('returns {} for no gear', () => {
    expect(itemStatMultiplier([])).toEqual({});
  });

  it('maps a single piece of gear to its affinity', () => {
    const mults = itemStatMultiplier(['orb_of_avarice']);
    expect(mults.CHA).toBeCloseTo(ITEMS.orb_of_avarice.statMult!, 6);
  });

  it('stacks multipliers on the same attribute', () => {
    const mults = itemStatMultiplier(['orb_of_avarice', 'orb_of_avarice']);
    expect(mults.CHA).toBeCloseTo(ITEMS.orb_of_avarice.statMult! ** 2, 6);
  });

  it('ignores unknown and non-gear keys', () => {
    expect(itemStatMultiplier(['nonsense', 'mana_draught'])).toEqual({});
  });
});

describe('applyConsumable', () => {
  it('returns the effect for a consumable', () => {
    expect(applyConsumable('mana_draught')).toEqual({ kind: 'mana', amount: 30 });
  });

  it('throws for gear or unknown keys', () => {
    expect(() => applyConsumable('orb_of_avarice')).toThrow();
    expect(() => applyConsumable('nonsense')).toThrow();
  });
});
