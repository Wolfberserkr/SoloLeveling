import { describe, it, expect } from 'vitest';
import {
  rankForLevel,
  RANK_THRESHOLDS,
  statGainsFor,
  evaluateTitles,
  titleDef,
  TITLES,
  type TitleState,
  CLASSES,
  classDef,
  eligibleClasses,
  classXpMultiplier,
  SKILLS,
  skillDef,
  skillPrereqError,
  skillCooldownRemaining,
  skillXpMultiplier,
  skillStatMultiplier,
  skillManaRegenBonus,
  hasStreakShield,
} from '@game/progression.ts';
import { RANKS, STATS } from '@game/constants.ts';

const ZERO_STATE: TitleState = {
  level: 1,
  rankIndex: 0,
  bestStreak: 0,
  daysCompleted: 0,
  totalReps: 0,
  totalRunKm: 0,
  booksFinished: 0,
  questionsMastered: 0,
  dungeonCycles: 0,
  perfectClears: 0,
  riddlesSolved: 0,
};

describe('rank progression', () => {
  it('starts at E-Rank', () => {
    expect(rankForLevel(1)).toBe('E');
  });

  it('promotes exactly at each threshold', () => {
    for (const rank of RANKS) {
      const at = RANK_THRESHOLDS[rank];
      expect(rankForLevel(at)).toBe(rank);
      if (at > 1) expect(rankForLevel(at - 1)).not.toBe(rank);
    }
  });

  it('holds rank between thresholds', () => {
    expect(rankForLevel(5)).toBe('D'); // D@4, C@8
    expect(rankForLevel(7)).toBe('D');
    expect(rankForLevel(8)).toBe('C');
    expect(rankForLevel(40)).toBe('S'); // S@26, National@50
  });

  it('is monotonic in level', () => {
    let seen = 0;
    for (let level = 1; level <= 100; level++) {
      const idx = RANKS.indexOf(rankForLevel(level));
      expect(idx).toBeGreaterThanOrEqual(seen);
      seen = idx;
    }
  });

  it('tops out at Monarch', () => {
    expect(rankForLevel(75)).toBe('Monarch');
    expect(rankForLevel(100)).toBe('Monarch');
  });
});

describe('stat growth from activity', () => {
  it('maps known sources to positive gains on valid stats', () => {
    for (const source of ['training_quest', 'gym_session', 'reading_session', 'riddle_solved']) {
      const gains = statGainsFor(source);
      expect(Object.keys(gains).length).toBeGreaterThan(0);
      for (const [stat, amount] of Object.entries(gains)) {
        expect(STATS).toContain(stat);
        expect(amount).toBeGreaterThan(0);
      }
    }
  });

  it('returns no gains for unknown sources', () => {
    expect(statGainsFor('nonsense')).toEqual({});
  });

  it('exercises every one of the nine attributes across all sources', () => {
    const sources = [
      'training_quest',
      'perfect_clear',
      'daily_quest',
      'gym_session',
      'boss_clear',
      'reading_session',
      'book_applied',
      'book_finished',
      'knowledge_check',
      'gate_clear',
      'riddle_solved',
    ];
    const touched = new Set<string>();
    for (const s of sources) for (const k of Object.keys(statGainsFor(s))) touched.add(k);
    for (const stat of STATS) expect(touched).toContain(stat);
  });

  it('pays one-shot clears larger jumps than repeatables', () => {
    expect(statGainsFor('boss_clear').STR!).toBeGreaterThan(statGainsFor('gym_session').STR!);
    expect(statGainsFor('book_finished').INT!).toBeGreaterThan(statGainsFor('reading_session').INT!);
  });
});

describe('titles', () => {
  it('grants nothing at a zeroed start', () => {
    expect(evaluateTitles(ZERO_STATE)).toEqual([]);
  });

  it('grants the first-quest title on day one', () => {
    expect(evaluateTitles({ ...ZERO_STATE, daysCompleted: 1 })).toContain('awakened');
  });

  it('is cumulative — higher tiers include lower ones', () => {
    const earned = evaluateTitles({ ...ZERO_STATE, bestStreak: 100 });
    expect(earned).toEqual(expect.arrayContaining(['consistent', 'relentless', 'unbroken']));
  });

  it('gates a title strictly below its threshold', () => {
    expect(evaluateTitles({ ...ZERO_STATE, bestStreak: 6 })).not.toContain('consistent');
    expect(evaluateTitles({ ...ZERO_STATE, bestStreak: 7 })).toContain('consistent');
  });

  it('maps S-Rank to the Ascendant title', () => {
    const sRank = RANKS.indexOf('S');
    expect(evaluateTitles({ ...ZERO_STATE, rankIndex: sRank })).toContain('ascendant');
  });

  it('has unique keys and resolvable defs; metric-earned titles pay essence', () => {
    const keys = TITLES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of TITLES) {
      expect(titleDef(t.key)).toBe(t);
      if (!t.manual) expect(t.essence).toBeGreaterThan(0);
    }
  });

  it('excludes manual titles from the metric sweep', () => {
    // self_overcome is granted by the Legacy Boss, never by evaluateTitles.
    const maxed: TitleState = {
      level: 999,
      rankIndex: 99,
      bestStreak: 9999,
      daysCompleted: 9999,
      totalReps: 9_999_999,
      totalRunKm: 99999,
      booksFinished: 9999,
      questionsMastered: 9999,
      dungeonCycles: 9999,
      perfectClears: 9999,
      riddlesSolved: 9999,
    };
    expect(evaluateTitles(maxed)).not.toContain('self_overcome');
  });
});

describe('classes', () => {
  it('offers the dominant stat group as eligible options', () => {
    const physical = eligibleClasses({ STR: 30, END: 30, AGI: 30, INT: 10, WIS: 10, STA: 10, WIL: 10, DIS: 10, CHA: 10 });
    expect(physical.every((c) => c.group === 'Physical')).toBe(true);
    expect(physical.length).toBeGreaterThanOrEqual(2);

    const mental = eligibleClasses({ STR: 10, END: 10, AGI: 10, INT: 40, WIS: 40, STA: 40, WIL: 10, DIS: 10, CHA: 10 });
    expect(mental.every((c) => c.group === 'Mental')).toBe(true);
  });

  it('falls back to the first group on a flat profile (tie)', () => {
    const flat = eligibleClasses({ STR: 10, END: 10, AGI: 10, INT: 10, WIS: 10, STA: 10, WIL: 10, DIS: 10, CHA: 10 });
    expect(flat.every((c) => c.group === 'Physical')).toBe(true);
  });

  it('applies the XP bonus only to matching sources', () => {
    expect(classXpMultiplier('mage', 'reading_session')).toBeCloseTo(1.15);
    expect(classXpMultiplier('mage', 'gym_session')).toBe(1);
  });

  it('warden boosts every source', () => {
    expect(classXpMultiplier('warden', 'gym_session')).toBeCloseTo(1.08);
    expect(classXpMultiplier('warden', 'riddle_solved')).toBeCloseTo(1.08);
  });

  it('returns 1 for no class', () => {
    expect(classXpMultiplier(null, 'gym_session')).toBe(1);
    expect(classXpMultiplier('nonsense', 'gym_session')).toBe(1);
  });

  it('has unique keys with resolvable defs', () => {
    const keys = CLASSES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of CLASSES) expect(classDef(c.key)).toBe(c);
  });
});

describe('skills', () => {
  it('has unique keys with resolvable defs and consistent active fields', () => {
    const keys = SKILLS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of SKILLS) {
      expect(skillDef(s.key)).toBe(s);
      expect(s.essenceCost).toBeGreaterThan(0);
      if (s.type === 'active') {
        expect(s.cooldownDays).toBeGreaterThan(0);
        expect(s.effect).toBeTruthy();
      }
    }
  });

  it('gates unlock by level and rank', () => {
    const steel = skillDef('steel_will')!; // reqLevel 8, reqRank C
    expect(skillPrereqError(steel, { level: 4, rankIndex: 0 })).toMatch(/Level 8/);
    expect(skillPrereqError(steel, { level: 8, rankIndex: 0 })).toMatch(/C-Rank/);
    expect(skillPrereqError(steel, { level: 8, rankIndex: RANKS.indexOf('C') })).toBeNull();
  });

  it('counts down an active cooldown by local days', () => {
    expect(skillCooldownRemaining(null, 3, '2026-06-14')).toBe(0);
    expect(skillCooldownRemaining('2026-06-14', 3, '2026-06-14')).toBe(3);
    expect(skillCooldownRemaining('2026-06-14', 3, '2026-06-16')).toBe(1);
    expect(skillCooldownRemaining('2026-06-14', 3, '2026-06-17')).toBe(0);
    expect(skillCooldownRemaining('2026-06-14', 3, '2026-06-20')).toBe(0);
  });

  it('stacks passive XP, stat, and regen modifiers', () => {
    expect(skillXpMultiplier(['scholars_insight'], 'reading_session')).toBeCloseTo(1.1);
    expect(skillXpMultiplier(['scholars_insight'], 'gym_session')).toBe(1);
    expect(skillStatMultiplier(['iron_discipline'])).toBeCloseTo(1.15);
    expect(skillStatMultiplier([])).toBe(1);
    expect(skillManaRegenBonus(['mana_spring'])).toBe(15);
    expect(hasStreakShield(['steel_will'])).toBe(true);
    expect(hasStreakShield(['mana_spring'])).toBe(false);
  });

  it('ignores unknown or active keys in passive modifiers', () => {
    expect(skillXpMultiplier(['second_wind', 'nonsense'], 'gym_session')).toBe(1);
    expect(skillStatMultiplier(['transmute'])).toBe(1);
  });
});
