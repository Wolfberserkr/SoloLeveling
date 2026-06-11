import { describe, it, expect } from 'vitest';
import { sleepBonus, clampMana, DAILY_REGEN, MANA_COSTS } from '@game/mana.ts';
import { SIDE_QUEST_POOL } from '@game/daily.ts';

describe('sleep bonus', () => {
  it('rewards full recovery sleep with max mana and a potion', () => {
    expect(sleepBonus(8)).toEqual({ mana: 50, potion: true });
    expect(sleepBonus(9.5)).toEqual({ mana: 50, potion: true });
  });

  it('gives partial credit for 6–8h, no potion', () => {
    expect(sleepBonus(6)).toEqual({ mana: 30, potion: false });
    expect(sleepBonus(7.9)).toEqual({ mana: 30, potion: false });
  });

  it('gives a token amount under 6h', () => {
    expect(sleepBonus(5.9)).toEqual({ mana: 10, potion: false });
    expect(sleepBonus(0)).toEqual({ mana: 10, potion: false });
  });
});

describe('clampMana', () => {
  it('clamps into [0, max] and rounds', () => {
    expect(clampMana(150, 100)).toBe(100);
    expect(clampMana(-10, 100)).toBe(0);
    expect(clampMana(49.6, 100)).toBe(50);
  });
});

describe('daily mana economy balance', () => {
  it('regen alone covers a typical day of side quests', () => {
    // Two median-cost side quests must be affordable on regen alone, so a
    // player who never logs sleep can still play — just with no slack.
    const costs = SIDE_QUEST_POOL.map((q) => q.manaCost).sort((a, b) => a - b);
    const medianTwo = costs[0] + costs[Math.floor(costs.length / 2)];
    expect(medianTwo).toBeLessThanOrEqual(DAILY_REGEN);
  });

  it('worst-case quest pair still fits regen + decent sleep', () => {
    const costs = SIDE_QUEST_POOL.map((q) => q.manaCost).sort((a, b) => b - a);
    expect(costs[0] + costs[1]).toBeLessThanOrEqual(DAILY_REGEN + sleepBonus(6).mana);
  });

  it('side quest costs match the spec mana table', () => {
    for (const q of SIDE_QUEST_POOL) {
      expect(q.manaCost).toBe(MANA_COSTS[q.key]);
    }
  });
});
