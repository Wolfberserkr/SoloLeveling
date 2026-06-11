import { describe, it, expect } from 'vitest';
import {
  totalXpForLevel,
  xpCostOfLevel,
  levelFromTotalXp,
  levelProgress,
  applyDailyCap,
} from '@game/xpCurve.ts';

const DAILY_INCOME = 250; // sustained engaged income (capped repeatables + amortized books)

describe('XP curve pacing (1–2 year transformation)', () => {
  it('starts at zero', () => {
    expect(totalXpForLevel(1)).toBe(0);
    expect(levelFromTotalXp(0)).toBe(1);
  });

  // Spec: L10 ~2mo, L20 ~6mo, L30 ~12mo, L40 ~18mo, L50 ~24mo
  it.each([
    [10, 50, 75], // ~2 months
    [20, 150, 210], // ~6 months
    [30, 300, 400], // ~12 months
    [40, 460, 580], // ~18 months
    [50, 650, 790], // ~24 months
  ])('level %i is reached in %i–%i days at sustained income', (level, minDays, maxDays) => {
    const days = totalXpForLevel(level) / DAILY_INCOME;
    expect(days).toBeGreaterThanOrEqual(minDays);
    expect(days).toBeLessThanOrEqual(maxDays);
  });

  it('is non-linear and increasingly expensive', () => {
    let prev = 0;
    for (let level = 1; level < 60; level++) {
      const cost = xpCostOfLevel(level);
      expect(cost).toBeGreaterThan(prev);
      prev = cost;
    }
  });

  it('levelFromTotalXp inverts totalXpForLevel', () => {
    for (const level of [2, 5, 10, 25, 50, 99]) {
      expect(levelFromTotalXp(totalXpForLevel(level))).toBe(level);
      expect(levelFromTotalXp(totalXpForLevel(level) - 1)).toBe(level - 1);
    }
  });

  it('caps at MAX_LEVEL', () => {
    expect(levelFromTotalXp(Number.MAX_SAFE_INTEGER)).toBe(100);
  });

  it('reports level progress for bars', () => {
    const xp = totalXpForLevel(10) + 100;
    const p = levelProgress(xp);
    expect(p.level).toBe(10);
    expect(p.intoLevel).toBe(100);
    expect(p.fraction).toBeGreaterThan(0);
    expect(p.fraction).toBeLessThan(1);
  });
});

describe('daily XP cap (anti-grind)', () => {
  it('credits fully under the cap', () => {
    expect(applyDailyCap(40, 0)).toBe(40);
  });
  it('partially credits at the boundary', () => {
    expect(applyDailyCap(40, 280)).toBe(20);
  });
  it('credits nothing when saturated', () => {
    expect(applyDailyCap(40, 300)).toBe(0);
    expect(applyDailyCap(40, 500)).toBe(0);
  });
});
