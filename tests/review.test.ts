import { describe, it, expect } from 'vitest';
import {
  weekWindow,
  summarizeWeek,
  adaptiveLoad,
  clampLoad,
  ADAPT_LOAD_MAX,
  ADAPT_LOAD_MIN,
  type ReviewInput,
  type ReviewSummary,
} from '@game/review.ts';

const WINDOW = { start: '2026-06-01', end: '2026-06-07' }; // Mon–Sun

function input(overrides: Partial<ReviewInput> = {}): ReviewInput {
  return {
    window: WINDOW,
    trainingQuests: [],
    sideQuestsCompleted: 0,
    sleepLogs: [],
    ledger: [],
    readingSessions: [],
    booksFinished: 0,
    liftPrs: 0,
    newShadows: 0,
    bodyMetrics: [],
    streakEnd: 0,
    ...overrides,
  };
}

describe('weekWindow', () => {
  it('returns the most recently completed Mon–Sun week', () => {
    // 2026-06-16 is a Tuesday; the completed week before it is Jun 8–14.
    expect(weekWindow('2026-06-16')).toEqual({ start: '2026-06-08', end: '2026-06-14' });
  });

  it('on a Monday looks back at the previous full week, not the current day', () => {
    // 2026-06-15 is a Monday → the completed week is Jun 8–14.
    expect(weekWindow('2026-06-15')).toEqual({ start: '2026-06-08', end: '2026-06-14' });
  });

  it('on a Sunday looks back at the week that ended the day before', () => {
    // 2026-06-14 is a Sunday → completed week is the prior Mon–Sun, Jun 1–7.
    expect(weekWindow('2026-06-14')).toEqual({ start: '2026-06-01', end: '2026-06-07' });
  });

  it('always spans exactly seven days', () => {
    for (const day of ['2026-01-01', '2026-02-28', '2026-12-31', '2027-03-01']) {
      const { start, end } = weekWindow(day);
      const days = (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000;
      expect(days).toBe(6); // inclusive endpoints → 6 gaps = 7 days
    }
  });
});

describe('summarizeWeek', () => {
  it('counts completed/failed/recovery training days and sums effort', () => {
    const s = summarizeWeek(
      input({
        trainingQuests: [
          { status: 'completed', perfect_clear: true, pushups_done: 50, situps_done: 40, squats_done: 60, run_km_done: 5 },
          { status: 'completed', variant: 'recovery', pushups_done: 10, situps_done: 10, squats_done: 10, run_km_done: '1.5' },
          { status: 'failed', pushups_done: 0, situps_done: 0, squats_done: 0, run_km_done: 0 },
        ],
      }),
    );
    expect(s.daysCompleted).toBe(2);
    expect(s.daysFailed).toBe(1);
    expect(s.recoveryDays).toBe(1);
    expect(s.perfectClears).toBe(1);
    expect(s.pushups).toBe(60);
    expect(s.runKm).toBe(6.5);
  });

  it('passes fueled days through, defaulting to 0 for pre-Phase-11 callers', () => {
    expect(summarizeWeek(input()).daysFueled).toBe(0);
    expect(summarizeWeek(input({ daysFueled: 5 })).daysFueled).toBe(5);
  });

  it('averages only the nights actually logged', () => {
    const s = summarizeWeek(input({ sleepLogs: [{ hours: 8 }, { hours: '7' }, { hours: 6 }] }));
    expect(s.nightsLogged).toBe(3);
    expect(s.avgSleepHours).toBe(7);
  });

  it('avoids divide-by-zero when no sleep was logged', () => {
    expect(summarizeWeek(input()).avgSleepHours).toBe(0);
  });

  it('sums credited XP and pages, passes through counts', () => {
    const s = summarizeWeek(
      input({
        ledger: [{ credited: 100 }, { credited: 50 }],
        readingSessions: [{ pages: 20 }, { pages: 15 }],
        booksFinished: 1,
        liftPrs: 2,
        newShadows: 1,
        sideQuestsCompleted: 4,
        streakEnd: 9,
      }),
    );
    expect(s.xpEarned).toBe(150);
    expect(s.pagesRead).toBe(35);
    expect(s.booksFinished).toBe(1);
    expect(s.liftPrs).toBe(2);
    expect(s.newShadows).toBe(1);
    expect(s.sideQuestsCompleted).toBe(4);
    expect(s.streakEnd).toBe(9);
  });

  it('computes weight change from first vs last reading, ignoring nulls', () => {
    const s = summarizeWeek(
      input({
        bodyMetrics: [
          { local_date: '2026-06-01', weight_kg: 80 },
          { local_date: '2026-06-04', weight_kg: null },
          { local_date: '2026-06-07', weight_kg: 78.5 },
        ],
      }),
    );
    expect(s.weightChangeKg).toBe(-1.5);
  });

  it('reports null weight change with fewer than two readings', () => {
    expect(summarizeWeek(input({ bodyMetrics: [{ local_date: '2026-06-01', weight_kg: 80 }] })).weightChangeKg).toBe(null);
  });

  it('flags a quiet week when nothing measurable happened', () => {
    expect(summarizeWeek(input()).quiet).toBe(true);
    expect(summarizeWeek(input({ ledger: [{ credited: 10 }] })).quiet).toBe(false);
  });
});

function summary(overrides: Partial<ReviewSummary> = {}): ReviewSummary {
  return {
    weekStart: '2026-06-01',
    weekEnd: '2026-06-07',
    daysCompleted: 0,
    daysFailed: 0,
    recoveryDays: 0,
    perfectClears: 0,
    pushups: 0,
    situps: 0,
    squats: 0,
    runKm: 0,
    sideQuestsCompleted: 0,
    nightsLogged: 0,
    avgSleepHours: 0,
    xpEarned: 0,
    pagesRead: 0,
    booksFinished: 0,
    liftPrs: 0,
    newShadows: 0,
    weightChangeKg: null,
    streakEnd: 0,
    quiet: false,
    ...overrides,
  };
}

describe('clampLoad', () => {
  it('bounds the multiplier and rounds to 2 decimals', () => {
    expect(clampLoad(2)).toBe(ADAPT_LOAD_MAX);
    expect(clampLoad(0.1)).toBe(ADAPT_LOAD_MIN);
    expect(clampLoad(1.234)).toBe(1.23);
    expect(clampLoad(NaN)).toBe(1);
  });
});

describe('adaptiveLoad', () => {
  it('progresses after a strong, well-recovered week', () => {
    const adj = adaptiveLoad(summary({ daysCompleted: 7, daysFailed: 0, nightsLogged: 7, avgSleepHours: 7.5 }), 1.0);
    expect(adj.reason).toBe('progress');
    expect(adj.after).toBe(1.05);
    expect(adj.delta).toBe(0.05);
  });

  it('progresses with no sleep logged (absence is not under-recovery)', () => {
    expect(adaptiveLoad(summary({ daysCompleted: 6, nightsLogged: 0 }), 1.0).reason).toBe('progress');
  });

  it('does not progress when recovery days inflate the completed count', () => {
    // 7 completed but 2 were recovery → only 5 hard days, not overload-worthy.
    expect(adaptiveLoad(summary({ daysCompleted: 7, recoveryDays: 2, nightsLogged: 0 }), 1.0).reason).toBe('hold');
  });

  it('deloads after a week with several failures', () => {
    const adj = adaptiveLoad(summary({ daysCompleted: 3, daysFailed: 3 }), 1.0);
    expect(adj.reason).toBe('deload');
    expect(adj.after).toBe(0.9);
  });

  it('deloads on chronic under-recovery despite completing days', () => {
    expect(
      adaptiveLoad(summary({ daysCompleted: 6, daysFailed: 0, nightsLogged: 5, avgSleepHours: 5 }), 1.0).reason,
    ).toBe('deload');
  });

  it('holds when there is too little signal', () => {
    expect(adaptiveLoad(summary({ daysCompleted: 2, daysFailed: 0 }), 1.1).reason).toBe('hold');
    expect(adaptiveLoad(summary({ quiet: true }), 1.1).reason).toBe('hold');
  });

  it('respects the ceiling and floor, reporting hold when capped', () => {
    const capped = adaptiveLoad(summary({ daysCompleted: 7, nightsLogged: 0 }), ADAPT_LOAD_MAX);
    expect(capped.after).toBe(ADAPT_LOAD_MAX);
    expect(capped.reason).toBe('hold');

    const floored = adaptiveLoad(summary({ daysFailed: 4 }), ADAPT_LOAD_MIN);
    expect(floored.after).toBe(ADAPT_LOAD_MIN);
    expect(floored.reason).toBe('hold');
  });
});
