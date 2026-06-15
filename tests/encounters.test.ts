import { describe, it, expect } from 'vitest';
import {
  ENCOUNTER_SCENARIOS,
  EXPLORE_MANA_COST,
  EXPLORES_PER_DAY,
  eligibleScenarios,
  rollScenario,
  monsterScaling,
  successChance,
  rollOutcome,
  rollLoot,
  rareShadowDrop,
  rollConsolationXp,
  encounterShadowGrade,
  resolveSeed,
} from '@game/encounters.ts';
import { mulberry32, hashString } from '@game/rng.ts';
import { STATS } from '@game/constants.ts';
import { ITEMS } from '@game/items.ts';
import { SHADOW_GRADES } from '@game/shadows.ts';

describe('scenario bank integrity', () => {
  it('has unique scenario keys', () => {
    const keys = ENCOUNTER_SCENARIOS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every scenario has 3-4 choices with unique keys, valid stats, and real text', () => {
    for (const s of ENCOUNTER_SCENARIOS) {
      expect(s.choices.length).toBeGreaterThanOrEqual(3);
      expect(s.choices.length).toBeLessThanOrEqual(4);
      const cKeys = s.choices.map((c) => c.key);
      expect(new Set(cKeys).size).toBe(cKeys.length);
      expect(s.title.length).toBeGreaterThan(2);
      expect(s.body.length).toBeGreaterThan(20);
      for (const c of s.choices) {
        expect(STATS).toContain(c.stat);
        expect(c.baseDifficulty).toBeGreaterThan(0);
        expect(c.label.length).toBeGreaterThan(2);
      }
    }
  });

  it('exercises all nine attributes across the bank', () => {
    const touched = new Set<string>();
    for (const s of ENCOUNTER_SCENARIOS) for (const c of s.choices) touched.add(c.stat);
    for (const stat of STATS) expect(touched).toContain(stat);
  });

  it('sane explore constants', () => {
    expect(EXPLORE_MANA_COST).toBeGreaterThan(0);
    expect(EXPLORES_PER_DAY).toBeGreaterThan(0);
  });
});

describe('rank eligibility', () => {
  it('excludes rank-gated scenarios at rank 0', () => {
    const pool = eligibleScenarios(0);
    expect(pool.every((s) => (s.minRankIndex ?? 0) <= 0)).toBe(true);
    expect(pool.length).toBeLessThan(ENCOUNTER_SCENARIOS.length);
  });

  it('includes everything at high rank', () => {
    expect(eligibleScenarios(7).length).toBe(ENCOUNTER_SCENARIOS.length);
  });

  it('rollScenario is deterministic per seed and respects rank', () => {
    const a = rollScenario(mulberry32(42), 0);
    const b = rollScenario(mulberry32(42), 0);
    expect(a.key).toBe(b.key);
    expect(a.minRankIndex ?? 0).toBeLessThanOrEqual(0);
  });
});

describe('stat-check probability', () => {
  it('is exactly 0.5 at parity', () => {
    expect(successChance(20, 20)).toBeCloseTo(0.5, 6);
  });

  it('is monotonic increasing in stat value', () => {
    expect(successChance(25, 20)).toBeGreaterThan(successChance(20, 20));
    expect(successChance(20, 20)).toBeGreaterThan(successChance(15, 20));
  });

  it('is clamped to [0.05, 0.95]', () => {
    expect(successChance(1000, 0)).toBeLessThanOrEqual(0.95);
    expect(successChance(0, 1000)).toBeGreaterThanOrEqual(0.05);
  });

  it('rollOutcome is deterministic per seed', () => {
    expect(rollOutcome(mulberry32(7), 20, 12)).toBe(rollOutcome(mulberry32(7), 20, 12));
  });
});

describe('monster scaling', () => {
  it('raises difficulty and keeps xp in band as rank climbs', () => {
    const low = monsterScaling(1, 0);
    const high = monsterScaling(50, 5);
    expect(high.difficultyBonus).toBeGreaterThan(low.difficultyBonus);
    for (const r of [0, 1, 3, 5, 7]) {
      const s = monsterScaling(10, r);
      expect(s.xpBase).toBeGreaterThanOrEqual(15);
      expect(s.xpBase).toBeLessThanOrEqual(30);
    }
  });
});

describe('loot', () => {
  it('is deterministic per seed', () => {
    const a = rollLoot(mulberry32(99), monsterScaling(10, 1), 1);
    const b = rollLoot(mulberry32(99), monsterScaling(10, 1), 1);
    expect(a).toEqual(b);
  });

  it('grants in-band xp, 1-5 essence, and only real item keys', () => {
    for (let i = 0; i < 200; i++) {
      const loot = rollLoot(mulberry32(hashString(`loot-${i}`)), monsterScaling(10, 1), 1);
      expect(loot.xp).toBeGreaterThanOrEqual(15);
      expect(loot.xp).toBeLessThanOrEqual(30);
      expect(loot.essence).toBeGreaterThanOrEqual(1);
      expect(loot.essence).toBeLessThanOrEqual(5);
      for (const item of loot.items) {
        expect(ITEMS[item.key]).toBeDefined();
        expect(item.qty).toBeGreaterThan(0);
      }
    }
  });

  it('consolation xp is 3-5', () => {
    for (let i = 0; i < 50; i++) {
      const xp = rollConsolationXp(mulberry32(hashString(`c-${i}`)));
      expect(xp).toBeGreaterThanOrEqual(3);
      expect(xp).toBeLessThanOrEqual(5);
    }
  });
});

describe('rare shadow drop', () => {
  it('drops around 5% at rank 0 with a valid grade', () => {
    let drops = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const s = rareShadowDrop(mulberry32(hashString(`sh-${i}`)), 0);
      if (s) {
        drops++;
        expect(SHADOW_GRADES).toContain(s.grade);
        expect(s.name.length).toBeGreaterThan(0);
      }
    }
    const rate = drops / n;
    expect(rate).toBeGreaterThan(0.02);
    expect(rate).toBeLessThan(0.09);
  });

  it('encounterShadowGrade returns a valid grade for every rank', () => {
    for (let r = 0; r <= 7; r++) expect(SHADOW_GRADES).toContain(encounterShadowGrade(r));
  });
});

describe('resolveSeed', () => {
  it('is deterministic and varies by choice', () => {
    expect(resolveSeed(123, 'charge')).toBe(resolveSeed(123, 'charge'));
    expect(resolveSeed(123, 'charge')).not.toBe(resolveSeed(123, 'dodge'));
  });
});
