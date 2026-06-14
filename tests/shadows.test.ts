import { describe, it, expect } from 'vitest';
import {
  bossShadowGrade,
  gateShadowGrade,
  bookShadowGrade,
  shadowPassive,
  armyCapacity,
  extractChance,
  shadowXpMultiplier,
  shadowStatMultiplier,
  shadowManaRegenBonus,
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

describe('grade scaling by source', () => {
  it('grades Gates by player level and tomes by length', () => {
    expect(gateShadowGrade(1)).toBe('Soldier');
    expect(gateShadowGrade(35)).toBe('Marshal');
    expect(bookShadowGrade(120)).toBe('Soldier');
    expect(bookShadowGrade(500)).toBe('Elite Knight');
  });
});

describe('shadow passives by source', () => {
  it('boss → XP on body sources, scaling with grade', () => {
    const knight = shadowPassive('boss', 'Knight');
    const monarch = shadowPassive('boss', 'Monarch');
    expect(knight.kind).toBe('xp');
    if (knight.kind === 'xp') expect(knight.sources).toContain('gym_session');
    if (knight.kind === 'xp' && monarch.kind === 'xp') {
      expect(monarch.mult).toBeGreaterThan(knight.mult);
    }
  });

  it('gate → mana regen, book → stat gains, legacy → all-source XP', () => {
    const gate = shadowPassive('gate', 'Knight');
    expect(gate.kind).toBe('mana_regen');
    if (gate.kind === 'mana_regen') expect(gate.amount).toBeGreaterThan(0);

    const book = shadowPassive('book', 'Elite Knight');
    expect(book.kind).toBe('stat');
    if (book.kind === 'stat') expect(book.mult).toBeGreaterThan(1);

    const legacy = shadowPassive('legacy', 'Monarch');
    expect(legacy.kind).toBe('xp');
    if (legacy.kind === 'xp') expect(legacy.sources).toBe('all');
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
  it('XP stacks multiplicatively and only on matching sources', () => {
    const deployed: DeployedShadow[] = [
      { source_type: 'boss', grade: 'Knight' }, // body sources ×1.05
      { source_type: 'legacy', grade: 'Soldier' }, // all sources ×1.03
    ];
    expect(shadowXpMultiplier(deployed, 'gym_session')).toBeCloseTo(1.05 * 1.03);
    expect(shadowXpMultiplier(deployed, 'reading_session')).toBeCloseTo(1.03);
    expect(shadowXpMultiplier([], 'gym_session')).toBe(1);
  });

  it('separates stat, regen, and XP passives by kind', () => {
    const deployed: DeployedShadow[] = [
      { source_type: 'book', grade: 'Knight' }, // stat ×1.05
      { source_type: 'gate', grade: 'Elite Knight' }, // +4 regen
      { source_type: 'boss', grade: 'Knight' }, // body XP only
    ];
    expect(shadowStatMultiplier(deployed)).toBeCloseTo(1.05);
    expect(shadowManaRegenBonus(deployed)).toBe(4);
    // The stat/regen/body shadows don't bleed into unrelated XP sources.
    expect(shadowXpMultiplier(deployed, 'reading_session')).toBe(1);
  });
});
