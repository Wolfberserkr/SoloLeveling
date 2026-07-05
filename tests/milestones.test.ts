import { describe, expect, it } from 'vitest';
import { nextMilestones, type MilestoneState } from '@game/milestones.ts';
import { totalXpForLevel } from '@game/xpCurve.ts';

function state(overrides: Partial<MilestoneState> = {}): MilestoneState {
  return {
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
    xpTotal: 0,
    earnedTitleKeys: [],
    dungeonPhase: 1,
    dungeonSessions: 0,
    ...overrides,
  };
}

describe('nextMilestones', () => {
  it('returns at most the requested number, closest first', () => {
    const ms = nextMilestones(state(), 3);
    expect(ms).toHaveLength(3);
    for (let i = 1; i < ms.length; i++) {
      expect(ms[i - 1].progress).toBeGreaterThanOrEqual(ms[i].progress);
    }
  });

  it('tracks XP progress toward the next level', () => {
    const halfway = Math.round((totalXpForLevel(2) + totalXpForLevel(3)) / 2);
    const ms = nextMilestones(state({ level: 2, xpTotal: halfway }), 5);
    const level = ms.find((m) => m.kind === 'level')!;
    expect(level.label).toBe('Level 3');
    expect(level.progress).toBeGreaterThan(0.4);
    expect(level.progress).toBeLessThan(0.6);
  });

  it('shows the next rank with levels remaining', () => {
    const ms = nextMilestones(state({ level: 7, xpTotal: totalXpForLevel(7) }), 5);
    const rank = ms.find((m) => m.kind === 'rank')!;
    expect(rank.label).toContain('C-Rank');
    expect(rank.detail).toContain('Level 8');
    expect(rank.detail).toContain('1 level to go');
  });

  it('excludes earned titles and already-crossed thresholds', () => {
    const ms = nextMilestones(
      state({ daysCompleted: 6, bestStreak: 6, earnedTitleKeys: ['awakened'] }),
      5,
    );
    const titleKeys = ms.filter((m) => m.kind === 'title').map((m) => m.key);
    expect(titleKeys).not.toContain('title-awakened');
    // daysCompleted 6 has crossed awakened(1) but that is earned; consistent(7)
    // at 6/7 streak days should be the closest title.
    expect(titleKeys).toContain('title-consistent');
  });

  it('flags a ready boss at full progress', () => {
    const ms = nextMilestones(state({ dungeonSessions: 24 }), 5);
    const boss = ms.find((m) => m.kind === 'boss')!;
    expect(boss.progress).toBe(1);
    expect(boss.detail).toMatch(/awaits/);
  });

  it('counts dungeon runs remaining until the boss appears', () => {
    const ms = nextMilestones(state({ dungeonSessions: 23 }), 5);
    const boss = ms.find((m) => m.kind === 'boss')!;
    expect(boss.detail).toContain('1 dungeon run until it appears');
  });
});
