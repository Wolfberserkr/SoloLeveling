import { describe, it, expect } from 'vitest';
import {
  readingXp,
  bookFinishXp,
  isBookFinished,
  addDays,
  initialDueDate,
  reviewOutcome,
  READING_XP_MIN,
  READING_XP_MAX,
  BOOK_FINISH_XP_MIN,
  BOOK_FINISH_XP_MAX,
  RETENTION_INTERVALS,
} from '@game/library.ts';
import { DAILY_XP_CAP } from '@game/constants.ts';

describe('reading XP', () => {
  it('pays a floor for short honest sessions and caps marathons', () => {
    expect(readingXp(1)).toBe(READING_XP_MIN);
    expect(readingXp(5)).toBe(READING_XP_MIN);
    expect(readingXp(500)).toBe(READING_XP_MAX);
  });

  it('scales with pages — a standard ~30-page session pays in between', () => {
    const xp = readingXp(30);
    expect(xp).toBeGreaterThan(READING_XP_MIN);
    expect(xp).toBeLessThan(READING_XP_MAX);
    expect(readingXp(60)).toBeGreaterThan(xp);
  });

  it('can never drain the daily cap in one log', () => {
    expect(READING_XP_MAX).toBeLessThan(DAILY_XP_CAP / 2);
  });
});

describe('finishing a tome', () => {
  it('detects completion at exactly the last page', () => {
    expect(isBookFinished(199, 200)).toBe(false);
    expect(isBookFinished(200, 200)).toBe(true);
  });

  it('pays more for thicker books, clamped to a sane band', () => {
    expect(bookFinishXp(50)).toBe(BOOK_FINISH_XP_MIN);
    expect(bookFinishXp(400)).toBe(100);
    expect(bookFinishXp(5000)).toBe(BOOK_FINISH_XP_MAX);
    expect(bookFinishXp(600)).toBeGreaterThan(bookFinishXp(300));
  });
});

describe('retention schedule', () => {
  it('intervals are strictly increasing — spaced repetition, not nagging', () => {
    for (let i = 1; i < RETENTION_INTERVALS.length; i++) {
      expect(RETENTION_INTERVALS[i]).toBeGreaterThan(RETENTION_INTERVALS[i - 1]);
    }
  });

  it('a banked question is first tested the next day', () => {
    expect(initialDueDate('2026-06-11')).toBe('2026-06-12');
  });

  it('addDays handles month and year boundaries', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01');
    expect(addDays('2026-12-25', 14)).toBe('2027-01-08');
  });

  it('each honest recall pushes the next check further out', () => {
    const today = '2026-06-11';
    let stage = 0;
    const gaps: string[] = [];
    while (true) {
      const out = reviewOutcome(stage, true, today);
      if (out.mastered) break;
      gaps.push(out.dueDate!);
      stage = out.stage;
    }
    expect(gaps).toEqual(RETENTION_INTERVALS.slice(1).map((d) => addDays(today, d)));
  });

  it('mastery lands after passing every rung, then the System stops asking', () => {
    const out = reviewOutcome(RETENTION_INTERVALS.length - 1, true, '2026-06-11');
    expect(out.mastered).toBe(true);
    expect(out.dueDate).toBeNull();
    expect(reviewOutcome(RETENTION_INTERVALS.length - 2, true, '2026-06-11').mastered).toBe(false);
  });

  it('a lapse resets to the bottom of the ladder, due tomorrow', () => {
    const out = reviewOutcome(3, false, '2026-06-11');
    expect(out).toEqual({ stage: 0, dueDate: '2026-06-12', mastered: false });
  });
});
