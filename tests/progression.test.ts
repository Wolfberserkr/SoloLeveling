import { describe, it, expect } from 'vitest';
import {
  rankForLevel,
  RANK_THRESHOLDS,
  statGainsFor,
  evaluateTitles,
  titleDef,
  TITLES,
  type TitleState,
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

  it('has unique keys and resolvable defs with positive essence', () => {
    const keys = TITLES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of TITLES) {
      expect(titleDef(t.key)).toBe(t);
      expect(t.essence).toBeGreaterThan(0);
    }
  });
});
