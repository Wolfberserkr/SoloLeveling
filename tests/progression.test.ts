import { describe, it, expect } from 'vitest';
import {
  rankForLevel,
  RANK_ENTRY_LEVELS,
  STAT_AWARDS,
  statAwardsFor,
  CLASSES,
  classByKey,
  CLASS_UNLOCK_LEVEL,
  CLASS_XP_MULT,
  SKILLS,
  TITLES,
  unlockedSkills,
  earnedTitles,
  xpMultiplier,
  skillRegenBonus,
  type Snapshot,
} from '@game/progression.ts';
import {
  STATS,
  RANKS,
  MAX_LEVEL,
  DAILY_XP_CAP,
  TRAINING_XP,
  TRAINING_TIERS,
} from '@game/constants.ts';

const FRESH: Snapshot = {
  level: 1,
  bestStreak: 0,
  daysCompleted: 0,
  runKmTotal: 0,
  gymSessions: 0,
  bossClears: 0,
  booksFinished: 0,
  questionsMastered: 0,
  riddlesSolved: 0,
  gatesCleared: 0,
  perfectClears: 0,
};

const VETERAN: Snapshot = {
  level: 65,
  bestStreak: 60,
  daysCompleted: 400,
  runKmTotal: 500,
  gymSessions: 100,
  bossClears: 6,
  booksFinished: 12,
  questionsMastered: 40,
  riddlesSolved: 10,
  gatesCleared: 25,
  perfectClears: 30,
};

describe('ranks', () => {
  it('start at E and end at Monarch, never skipping or regressing', () => {
    expect(rankForLevel(1)).toBe('E');
    let prevIdx = 0;
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const idx = RANKS.indexOf(rankForLevel(level));
      expect(idx).toBeGreaterThanOrEqual(prevIdx);
      expect(idx - prevIdx).toBeLessThanOrEqual(1);
      prevIdx = idx;
    }
    expect(rankForLevel(MAX_LEVEL)).toBe('Monarch');
  });

  it('E–S bands align with the training tiers', () => {
    for (let i = 0; i < TRAINING_TIERS.length; i++) {
      expect(RANK_ENTRY_LEVELS[i].entryLevel).toBe(TRAINING_TIERS[i].entryLevel);
    }
  });

  it('advances exactly at each entry level', () => {
    for (const { rank, entryLevel } of RANK_ENTRY_LEVELS) {
      expect(rankForLevel(entryLevel)).toBe(rank);
      if (entryLevel > 1) expect(rankForLevel(entryLevel - 1)).not.toBe(rank);
    }
  });
});

describe('stat awards', () => {
  it('every increment is small and positive (bump_stats enforces 0–5 too)', () => {
    for (const bumps of Object.values(STAT_AWARDS)) {
      for (const v of Object.values(bumps)) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThanOrEqual(5);
      }
    }
  });

  it('every one of the 9 stats is trainable through some source', () => {
    const reachable = new Set(Object.values(STAT_AWARDS).flatMap((b) => Object.keys(b)));
    expect([...reachable].sort()).toEqual([...STATS].sort());
  });

  it('unknown sources award nothing', () => {
    expect(statAwardsFor('made_up_source')).toBeNull();
    expect(statAwardsFor('training_quest')).not.toBeNull();
  });
});

describe('classes', () => {
  it('have unique keys and at least one amplified source each', () => {
    const keys = CLASSES.map((c) => c.key);
    expect(new Set(keys).size).toBe(CLASSES.length);
    for (const c of CLASSES) {
      expect(c.sources.length).toBeGreaterThan(0);
      for (const s of c.sources) expect(STAT_AWARDS[s]).toBeDefined();
    }
  });

  it('amplify only their own domain', () => {
    const sage = classByKey('sage')!;
    expect(xpMultiplier('sage', [], 'reading_session')).toBeCloseTo(CLASS_XP_MULT);
    expect(xpMultiplier('sage', [], 'gym_session')).toBe(1);
    expect(xpMultiplier(null, [], sage.sources[0])).toBe(1);
    expect(xpMultiplier('not_a_class', [], 'training_quest')).toBe(1);
  });

  it('unlock level sits inside the early-game ramp', () => {
    expect(CLASS_UNLOCK_LEVEL).toBeGreaterThanOrEqual(5);
    expect(CLASS_UNLOCK_LEVEL).toBeLessThanOrEqual(15);
  });
});

describe('skills', () => {
  it('have unique keys, and a fresh player has none', () => {
    expect(new Set(SKILLS.map((s) => s.key)).size).toBe(SKILLS.length);
    expect(unlockedSkills(FRESH)).toEqual([]);
  });

  it('a long-running veteran has them all', () => {
    expect(unlockedSkills(VETERAN).length).toBe(SKILLS.length);
  });

  it('every skill carries a real perk (xp or regen)', () => {
    for (const skill of SKILLS) {
      expect(Boolean(skill.xp) || Boolean(skill.regenBonus)).toBe(true);
      if (skill.xp) {
        expect(skill.xp.mult).toBeGreaterThan(1);
        expect(skill.xp.mult).toBeLessThanOrEqual(1.25);
      }
    }
  });

  it('xp perks stack multiplicatively with class, and round small', () => {
    // Striker with Sprint and Tenacity on the daily training quest.
    const mult = xpMultiplier('striker', ['sprint', 'tenacity'], 'training_quest');
    expect(mult).toBeCloseTo(1.1 * 1.05 * 1.05);
    // Even fully stacked, a day of boosted repeatables stays near the cap's scale.
    expect(Math.round(TRAINING_XP * mult)).toBeLessThan(DAILY_XP_CAP / 4);
  });

  it('meditation adds regen; unknown keys add nothing', () => {
    expect(skillRegenBonus(['meditation'])).toBe(5);
    expect(skillRegenBonus(['sprint', 'ghost_skill'])).toBe(0);
  });
});

describe('titles', () => {
  it('have unique keys and names; fresh players earn none', () => {
    expect(new Set(TITLES.map((t) => t.key)).size).toBe(TITLES.length);
    expect(new Set(TITLES.map((t) => t.name)).size).toBe(TITLES.length);
    expect(earnedTitles(FRESH)).toEqual([]);
  });

  it('a veteran has earned every title', () => {
    expect(earnedTitles(VETERAN).length).toBe(TITLES.length);
  });

  it('earning is monotonic: progress never revokes a title', () => {
    const mid: Snapshot = { ...FRESH, level: 10, bestStreak: 7, bossClears: 1 };
    const later: Snapshot = { ...mid, level: 30, bestStreak: 31, bossClears: 3 };
    const midTitles = earnedTitles(mid).map((t) => t.key);
    const laterTitles = earnedTitles(later).map((t) => t.key);
    for (const key of midTitles) expect(laterTitles).toContain(key);
  });
});
