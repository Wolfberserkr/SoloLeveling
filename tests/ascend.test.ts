import { describe, it, expect } from 'vitest';
import {
  addDays, bestStreak, currentStreak, dailyCount, emptyData, lastScheduledMiss, levelFromXp, levelInfo,
  looksVague, parseMilestones, ticketStatus, titleFor, weekStart, weekdayOf, xpForLevel,
  type ACompletion, type AQuest, type AscendData,
} from '../src/features/ascend/logic';

const quest = (id: string, days: number[], createdOn = '2026-09-01'): AQuest => ({
  id, type: 'daily', title: id, statId: 'knowledge', subId: null, xp: 10, days, timed: false,
  due: null, target: null, doneAt: null, archived: false, createdOn,
});
let cid = 0;
const done = (questId: string, localDate: string, xp = 10): ACompletion => ({
  id: `c${cid++}`, kind: 'daily', questId, milestoneId: null, bossId: null, reviewId: null, title: questId,
  parentTitle: null, statId: 'knowledge', subId: null, xp, minutes: null, localDate, createdAt: Date.parse(localDate),
});
const data = (p: Partial<AscendData>): AscendData => ({ ...emptyData(), ...p });

describe('Ascend level curve (must match ascend_xp_for_level / ascend_level_from_xp in SQL)', () => {
  it('costs 25 × (n − 1) × (n + 2) XP to reach level n', () => {
    expect([1, 2, 3, 4, 5, 10, 11, 100].map(xpForLevel)).toEqual([0, 100, 250, 450, 700, 2700, 3250, 252450]);
    expect(xpForLevel(500)).toBe(252450); // capped
  });
  it('each level costs 50 XP more than the last', () => {
    for (let n = 2; n < 100; n++) expect(xpForLevel(n + 1) - xpForLevel(n) - (xpForLevel(n) - xpForLevel(n - 1))).toBe(50);
  });
  it('inverts exactly at every boundary', () => {
    for (let n = 1; n <= 100; n++) {
      expect(levelFromXp(xpForLevel(n))).toBe(n);
      if (n > 1) expect(levelFromXp(xpForLevel(n) - 1)).toBe(n - 1);
    }
    expect(levelFromXp(-50)).toBe(1);
    expect(levelFromXp(1e12)).toBe(100);
  });
  it('reports progress inside a level', () => {
    expect(levelInfo(3110)).toMatchObject({ level: 10, into: 410, span: 550, toNext: 140, max: false });
    expect(levelInfo(xpForLevel(100))).toMatchObject({ level: 100, max: true, pct: 1 });
  });
  it('names level ranges', () => {
    expect([1, 9, 10, 24, 25, 50, 75, 99, 100].map(titleFor)).toEqual(['Initiate', 'Initiate', 'Apprentice', 'Apprentice', 'Adept', 'Veteran', 'Master', 'Master', 'Ascended']);
  });
});

describe('dates', () => {
  it('does calendar math on keys without the device timezone', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30'); // EU DST change
    expect(weekdayOf('2026-09-30')).toBe(3); // Wednesday
    expect(weekStart('2026-10-04')).toBe('2026-09-28'); // Sunday → previous Monday
    expect(weekStart('2026-09-28')).toBe('2026-09-28');
  });
});

describe('daily quests', () => {
  it('counts active dailies per weekday', () => {
    const d = data({ quests: [quest('a', [1, 2]), quest('b', [1]), { ...quest('c', [1]), archived: true }] });
    expect(dailyCount(d, 1)).toBe(2);
    expect(dailyCount(d, 1, 'a')).toBe(1);
    expect(dailyCount(d, 0)).toBe(0);
  });
});

describe('streaks — scheduled days only, today never breaks one', () => {
  // Mon–Fri quest; 2026-09-21 is a Monday
  const q = quest('gym', [1, 2, 3, 4, 5], '2026-09-14');
  const days = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-28', '2026-09-29'];
  const d = data({ quests: [q], completions: days.map((k) => done('gym', k)) });

  it('skips unscheduled weekends and ignores an unfinished today', () => {
    expect(currentStreak(d, '2026-09-30', 'gym')).toBe(7);
    expect(currentStreak(data({ ...d, completions: [...d.completions, done('gym', '2026-09-30')] }), '2026-09-30', 'gym')).toBe(8);
  });
  it('a missed scheduled day resets the current streak but not the best', () => {
    const gap = data({ quests: [q], completions: d.completions.filter((c) => c.localDate !== '2026-09-28') });
    expect(currentStreak(gap, '2026-09-30', 'gym')).toBe(1);
    expect(bestStreak(gap, '2026-09-30', 'gym')).toBe(5);
  });
  it('overall days count once 3 dailies are done', () => {
    const qs = [quest('a', [3]), quest('b', [3]), quest('c', [3]), quest('d', [3])];
    const two = data({ quests: qs, completions: [done('a', '2026-09-23'), done('b', '2026-09-23')] });
    expect(currentStreak(two, '2026-09-24')).toBe(0);
    expect(lastScheduledMiss(two, '2026-09-24')).toBe('2026-09-23');
    const three = data({ quests: qs, completions: [...two.completions, done('c', '2026-09-23')] });
    expect(currentStreak(three, '2026-09-24')).toBe(1);
    expect(lastScheduledMiss(three, '2026-09-24')).toBeNull();
  });
});

describe('Golden Tickets', () => {
  it('locks, readies and keeps claimed tickets by lifetime XP', () => {
    const d = data({
      tickets: [{ id: 't2', xp: 1000, title: 'B', claimedAt: null }, { id: 't1', xp: 500, title: 'A', claimedAt: '2026-09-10' }, { id: 't3', xp: 600, title: 'C', claimedAt: null }],
      completions: [done('x', '2026-09-01', 650)],
    });
    expect(ticketStatus(d).map((t) => [t.id, t.status, t.remaining])).toEqual([['t1', 'claimed', 0], ['t3', 'ready', 0], ['t2', 'locked', 350]]);
  });
});

describe('quest helpers', () => {
  it('nudges vague intentions toward concrete actions', () => {
    expect(looksVague('Get better at studying')).toBe(true);
    expect(looksVague('Study 45 min without my phone')).toBe(false);
  });
  it('parses "Title | XP" milestone lines', () => {
    expect(parseMilestones('Sign up | 50\nRun 10 km\n\n| 20\nRace day | 300')).toEqual([
      { title: 'Sign up', xp: 50 }, { title: 'Run 10 km', xp: 100 }, { title: 'Race day', xp: 300 },
    ]);
  });
});
