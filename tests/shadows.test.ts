import { describe, it, expect } from 'vitest';
import {
  bossShadowGrade,
  shadowPassive,
  armyCapacity,
  extractChance,
  shadowXpMultiplier,
  SHADOW_GRADES,
  type DeployedShadow,
} from '@game/shadows.ts';
import { RANKS } from '@game/constants.ts';

describe('shadow grades', () => {
  it('maps dungeon boss phases 1–5 to rising grades', () => {
    expect(bossShadowGrade(1)).toBe('Knight');
    expect(bossShadowGrade(5)).toBe('Monarch');
    // Monotonic non-decreasing across phases.
    let prev = -1;
    for (let phase = 1; phase <= 5; phase++) {
      const idx = SHADOW_GRADES.indexOf(bossShadowGrade(phase));
      expect(idx).toBeGreaterThan(prev);
      prev = idx;
    }
  });

  it('clamps out-of-range phases', () => {
    expect(bossShadowGrade(0)).toBe('Knight');
    expect(bossShadowGrade(99)).toBe('Monarch');
  });
});

describe('shadow passives', () => {
  it('stronger grades grant bigger XP multipliers', () => {
    const soldier = shadowPassive('boss', 'Soldier').mult;
    const monarch = shadowPassive('boss', 'Monarch').mult;
    expect(monarch).toBeGreaterThan(soldier);
    expect(soldier).toBeGreaterThan(1);
  });

  it('routes each source to its domain; legacy buffs everything', () => {
    expect(shadowPassive('boss', 'Knight').sources).toContain('gym_session');
    expect(shadowPassive('book', 'Knight').sources).toContain('reading_session');
    expect(shadowPassive('legacy', 'Knight').sources).toBe('all');
  });
});

describe('army capacity', () => {
  it('grows with rank and never drops', () => {
    let prev = 0;
    for (const rank of RANKS) {
      const cap = armyCapacity(rank);
      expect(cap).toBeGreaterThanOrEqual(prev);
      prev = cap;
    }
    expect(armyCapacity('E')).toBe(1);
    expect(armyCapacity('Monarch')).toBeGreaterThan(armyCapacity('E'));
  });

  it('defaults to 1 for an unknown rank', () => {
    expect(armyCapacity('???')).toBe(1);
  });
});

describe('extract chance', () => {
  it('is lower for stronger grades, higher at higher rank, always clamped', () => {
    expect(extractChance('Monarch', 'E')).toBeLessThan(extractChance('Soldier', 'E'));
    expect(extractChance('Knight', 'Monarch')).toBeGreaterThan(extractChance('Knight', 'E'));
    for (const grade of SHADOW_GRADES) {
      for (const rank of RANKS) {
        const c = extractChance(grade, rank);
        expect(c).toBeGreaterThanOrEqual(0.1);
        expect(c).toBeLessThanOrEqual(0.95);
      }
    }
  });
});

describe('deployed shadow modifiers', () => {
  it('stacks multiplicatively and only on matching sources', () => {
    const deployed: DeployedShadow[] = [
      { source_type: 'boss', grade: 'Knight' }, // body sources ×1.05
      { source_type: 'legacy', grade: 'Soldier' }, // all sources ×1.03
    ];
    expect(shadowXpMultiplier(deployed, 'gym_session')).toBeCloseTo(1.05 * 1.03);
    expect(shadowXpMultiplier(deployed, 'reading_session')).toBeCloseTo(1.03);
    expect(shadowXpMultiplier([], 'gym_session')).toBe(1);
  });
});
