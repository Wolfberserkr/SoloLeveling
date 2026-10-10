import { describe, expect, it } from 'vitest';
import { EXBY, SESS, autoPhase } from '@/features/viking/vikingData';
import {
  dn, emptyData, iso, viking, type VikingData, type WorkoutDoc,
} from '@/features/viking/vikingLogic';

const START = '2026-01-05';
function data(over: Partial<VikingData> = {}): VikingData {
  return {
    ...emptyData(),
    settings: { startDate: START, startWeight: 102, phaseMode: 'auto', kcalAdjust: 0 },
    ...over,
  };
}
const day = (offset: number) => iso(dn(START) + offset);
function workout(date: string, session: WorkoutDoc['session'], entries: WorkoutDoc['entries'], savedAt = 0): WorkoutDoc {
  return { date, session, week: 1, phase: '1', deload: false, entries, savedAt };
}

describe('calendar', () => {
  it('maps plan weeks onto the five phases', () => {
    expect([1, 12, 13, 26, 27, 28, 29, 38, 39, 52].map(autoPhase))
      .toEqual(['1', '1', '2', '2', 'B', 'B', '3', '3', '4', '4']);
  });

  it('counts weeks from the start date and never below week 1', () => {
    const v = viking(data());
    expect(v.weekOf(START)).toBe(1);
    expect(v.weekOf(day(6))).toBe(1);
    expect(v.weekOf(day(7))).toBe(2);
    expect(v.weekOf(day(-30))).toBe(1);
  });

  it('a manual phase overrides the calendar', () => {
    const v = viking(data({ settings: { startDate: START, startWeight: 102, phaseMode: '4', kcalAdjust: 0 } }));
    expect(v.phaseOf(START)).toBe('4');
  });
});

describe('set counts', () => {
  const v = viking(data());
  const bench = SESS.UA.ex.find((e) => e.k === 'bench')!;
  const clat = SESS.UA.ex.find((e) => e.k === 'clat')!;
  const squat = SESS.LA.ex.find((e) => e.k === 'squat')!;

  it('adds an accessory set from phase 2 on', () => {
    expect(v.setCount(clat, 'UA', '1', false)).toBe(3);
    expect(v.setCount(clat, 'UA', '2', false)).toBe(4);
  });

  it('adds a set to upper compounds only in the lean build', () => {
    expect(v.setCount(bench, 'UA', '3', false)).toBe(3);
    expect(v.setCount(bench, 'UA', '4', false)).toBe(4);
    expect(v.setCount(squat, 'LA', '4', false)).toBe(3);
  });

  it('halves sets on a deload, rounding up', () => {
    expect(v.setCount(bench, 'UA', '1', true)).toBe(2);
    expect(v.setCount(clat, 'UA', '2', true)).toBe(2);
  });

  it('every sixth week is a deload', () => {
    expect([5, 6, 12, 13].map(v.isDeloadWeek)).toEqual([false, true, true, false]);
  });
});

describe('rotation and progression', () => {
  it('starts with Upper A and follows the last logged session', () => {
    expect(viking(data()).nextSession()).toBe('UA');
    const v = viking(data({ workouts: { a: workout(START, 'UB', []) } }));
    expect(v.nextSession()).toBe('LB');
    const w = viking(data({ workouts: { a: workout(START, 'LB', []) } }));
    expect(w.nextSession()).toBe('UA');
  });

  it('suggests the next load once the top of the range is hit on every set', () => {
    const sets = [{ kg: 60, reps: 8 }, { kg: 60, reps: 8 }, { kg: 60, reps: 8 }];
    const v = viking(data({ workouts: { a: workout(START, 'UA', [{ ex: 'bench', sets }]) } }));
    const hint = v.exHint(EXBY.bench);
    expect(hint.c).toBe('good');
    expect(hint.kg).toBe(62.5);
  });

  it('holds the weight when a set falls short', () => {
    const sets = [{ kg: 60, reps: 8 }, { kg: 60, reps: 6 }];
    const v = viking(data({ workouts: { a: workout(START, 'UA', [{ ex: 'bench', sets }]) } }));
    expect(v.exHint(EXBY.bench)).toMatchObject({ c: 'info', kg: 60 });
  });

  it('flags a plateau after three sessions without a better best set', () => {
    const s = (kg: number) => [{ ex: 'bench', sets: [{ kg, reps: 5 }] }];
    const workouts = {
      a: workout(day(0), 'UA', s(80)),
      b: workout(day(7), 'UA', s(75)),
      c: workout(day(14), 'UA', s(78)),
      d: workout(day(21), 'UA', s(80)),
    };
    const v = viking(data({ workouts }));
    expect(v.plateau('bench')).toBe(true);
    expect(v.exHint(EXBY.bench).c).toBe('warn');
  });
});

describe('fuel', () => {
  it('adds the calorie adjustment and 300 kcal on a 90-minute ride day', () => {
    const d = data({
      settings: { startDate: START, startWeight: 102, phaseMode: 'auto', kcalAdjust: 200 },
      rides: { r: { date: START, type: 'hard', minutes: 95 } },
    });
    const v = viking(d);
    expect(v.kcalTarget(START)).toBe(2100 + 200 + 300);
    expect(v.kcalTarget(day(1))).toBe(2300);
  });

  it('totals ticked plan items plus extras', () => {
    const v = viking(data({ nutrition: { [START]: { date: START, items: { m1: true, shake: true }, extraKcal: 100, extraProtein: 5 } } }));
    expect(v.nutTotals(START)).toMatchObject({ kcal: 1080, p: 110 });
  });
});

describe('coach', () => {
  /** Daily weigh-ins dropping by `perDay` kg from 102, for `n` days. */
  function weights(n: number, perDay: number) {
    const out: VikingData['weights'] = {};
    for (let i = 0; i < n; i++) out[day(i)] = { date: day(i), kg: 102 - i * perDay };
    return out;
  }

  it('calls a steady 0.5–1%/week loss the sweet spot', () => {
    const T = day(20);
    const v = viking(data({ weights: weights(21, 0.1) }));
    expect(v.coach(T).map((f) => f.t)).toContain('Sweet spot');
  });

  it('asks for 200 more kcal after two weeks of losing over 1%', () => {
    const T = day(20);
    const flags = viking(data({ weights: weights(21, 0.25) })).coach(T);
    const act = flags.find((f) => f.t === 'Losing too fast');
    expect(act).toMatchObject({ l: 'act', adj: 200 });
    expect(flags[0].l).toBe('act'); // actions sort first
  });

  it('waits two weeks after an adjustment before suggesting another', () => {
    const T = day(20);
    const v = viking(data({
      weights: weights(21, 0.25),
      settings: { startDate: START, startWeight: 102, phaseMode: 'auto', kcalAdjust: 200, adjDate: day(15) },
    }));
    expect(v.coach(T).map((f) => f.t)).not.toContain('Losing too fast');
  });

  it('reminds to weigh in when today has no weight', () => {
    expect(viking(data()).coach(START).map((f) => f.t)).toContain('Weigh in today');
  });
});

describe('checkpoint corridor', () => {
  it('runs from the start weight to each checkpoint band', () => {
    const v = viking(data());
    const s = dn(START);
    expect(v.bandAt(s)).toMatchObject({ lo: 102, hi: 102 });
    expect(v.bandAt(s + 13 * 7)).toMatchObject({ lo: 95, hi: 97 });
    const mid = v.bandAt(s + Math.round(13 * 7 / 2));
    expect(mid.lo).toBeGreaterThan(95);
    expect(mid.lo).toBeLessThan(102);
  });
});
