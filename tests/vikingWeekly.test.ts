import { describe, expect, it } from 'vitest';
import { dn, emptyData, iso, type RideDoc, type SetEntry, type VikingData, type WorkoutDoc } from '../supabase/functions/_shared/viking/logic.ts';
import { suggestionsFor, weekSummary, type Suggestion } from '../supabase/functions/_shared/viking/weekly.ts';

const START = '2026-01-05';
const day = (o: number) => iso(dn(START) + o);
function data(over: Partial<VikingData> = {}): VikingData {
  return { ...emptyData(), settings: { startDate: START, startWeight: 102, phaseMode: 'auto', kcalAdjust: 0 }, ...over };
}
const S = (kg: number, reps: number, est?: SetEntry['est']): SetEntry => ({ kg, reps, ...(est ? { est } : {}) });
function wo(date: string, ex: string, sets: SetEntry[], session: WorkoutDoc['session'] = 'UA'): WorkoutDoc {
  const t = Date.parse(`${date}T10:00:00Z`);
  return { date, session, week: 1, phase: '1', deload: false, entries: [{ ex, sets }], savedAt: t, startedAt: new Date(t).toISOString() };
}
const docs = (list: WorkoutDoc[]) => Object.fromEntries(list.map((w, i) => [`${w.date}_${i}`, w]));
const ride = (date: string, code: RideDoc['code'], minutes = 60): RideDoc =>
  ({ date, code, type: code === 'H1' || code === 'H2' || code === 'H3' ? 'hard' : 'easy', minutes, savedAt: 0 });

// a lift with 4 sessions where the last 3 never beat the first
const plateau = (ex = 'bench') => [
  wo(day(0), ex, [S(60, 10), S(60, 10)]),
  wo(day(2), ex, [S(60, 6), S(60, 6)]),
  wo(day(4), ex, [S(60, 6), S(60, 6)]),
  wo(day(6), ex, [S(60, 6), S(60, 6)]),
];
const NOW = `${day(7)}T09:00:00.000Z`;

describe('weekSummary', () => {
  it('PR flagged on real sets only', () => {
    // today = day(21): range day(14)..day(20)
    const hist = wo(day(0), 'bench', [S(60, 8)]);
    const est = wo(day(15), 'bench', [S(80, 12, ['reps'])]);
    const s = weekSummary(data({ workouts: docs([hist, est]) }), day(21), [], {});
    const l = s.lifts.find((x) => x.ex === 'bench')!;
    expect(s.from).toBe(day(14)); expect(s.to).toBe(day(20));
    expect(l.bestE1rm).toBeNull(); // only est sets in range for e1rm... real sets none
    expect(l.pr).toBe(false);
    expect(l.repsUnknown).toBe(1);

    const real = wo(day(16), 'bench', [S(70, 8)]);
    const s2 = weekSummary(data({ workouts: docs([hist, est, real]) }), day(21), [], {});
    const l2 = s2.lifts.find((x) => x.ex === 'bench')!;
    expect(l2.pr).toBe(true);
    expect(l2.topKg).toBe(70);
    expect(l2.bestE1rm).toBeCloseTo(70 * (1 + 8 / 30));
    expect(l2.sessions).toBe(2);
    // no earlier history: not a PR
    expect(weekSummary(data({ workouts: docs([real]) }), day(21), [], {}).lifts[0].pr).toBe(false);
  });

  it('prevTopKg, sessions done and slid days', () => {
    const w = [wo(day(8), 'bench', [S(55, 8)]), wo(day(15), 'bench', [S(60, 8)]), wo(day(17), 'csrow', [S(20, 8)])];
    const s = weekSummary(data({ workouts: docs(w) }), day(21), [day(13), day(16), day(19), day(21)], {});
    expect(s.lifts.find((x) => x.ex === 'bench')).toMatchObject({ topKg: 60, prevTopKg: 55, name: expect.any(String) });
    expect(s.sessions).toEqual({ done: 2, slidDays: 2 });
    expect(s.lifts.map((x) => x.ex).sort()).toEqual(['bench', 'csrow']);
  });

  it('rides count Z2 and hard vs cap', () => {
    const d = data({ rides: {
      a: ride(day(14), 'E1', 70),
      b: { ...ride(day(16), 'H1', 55), z2: 20 },
      c: ride(day(17), 'R1', 30),
      old: ride(day(10), 'E1', 99),
    } });
    const s = weekSummary(d, day(21), [], {});
    expect(s.rides).toEqual({ z2: 90, z2Target: 120, hard: 1, cap: 1, minutes: 155 });
  });

  it('stalled uses the full history, deload and retest flags', () => {
    const d = data({ workouts: docs(plateau()) });
    expect(weekSummary(d, day(8), [], {}).lifts[0].stalled).toBe(true);
    expect(weekSummary(d, day(8), [], { bench: `${day(5)}T00:00:00.000Z` }).lifts[0].stalled).toBe(false);
    // week 5 today -> week 6 is the deload
    expect(weekSummary(data(), day(28), [], {}).deloadNext).toBe(true);
    expect(weekSummary(data(), day(7), [], {}).deloadNext).toBe(false);
    expect(weekSummary(data(), day(40), [], {}).retestDue).toBe(true); // wk6 day 6
    expect(weekSummary(data(), day(10), [], {}).retestDue).toBe(false);
  });
});

describe('suggestionsFor', () => {
  it('plateau → one pending reset at 90%, and no second while open', () => {
    const d = data({ workouts: docs(plateau()) });
    const a = suggestionsFor(d, [], {}, NOW, day(7));
    expect(a).toEqual([{ id: 'bench-' + day(7), kind: 'reset', ex: 'bench', kg: 52.5, status: 'pending', createdAt: NOW }]);
    const b = suggestionsFor(d, a, {}, `${day(8)}T09:00:00.000Z`, day(8));
    expect(b).toHaveLength(1);
  });

  it('the id uses the local date passed in, not the UTC date of nowIso', () => {
    const late = `${day(8)}T02:00:00.000Z`; // 22:00 on day(7) in Aruba
    const [s] = suggestionsFor(data({ workouts: docs(plateau()) }), [], {}, late, day(7));
    expect(s).toMatchObject({ id: 'bench-' + day(7), createdAt: late });
  });

  it('declined waits 3 sessions; bw never suggested', () => {
    const w = plateau();
    const no: Suggestion = { id: 'bench-x', kind: 'reset', ex: 'bench', kg: 54, status: 'no', createdAt: NOW, decidedAt: NOW, snoozeUntil: 7 };
    expect(suggestionsFor(data({ workouts: docs(w) }), [no], {}, NOW, day(7))).toHaveLength(1); // 4 sessions < 7
    const more = [...w, wo(day(8), 'bench', [S(60, 8)]), wo(day(9), 'bench', [S(60, 8)]), wo(day(10), 'bench', [S(60, 8)])];
    const out = suggestionsFor(data({ workouts: docs(more) }), [no], {}, NOW, day(7));
    expect(out.filter((x) => x.status === 'pending')).toHaveLength(1);
    // bodyweight plateau
    const bw = [0, 2, 4, 6].map((o, i) => wo(day(o), 'hkr', [S(0, i === 0 ? 14 : 10)], 'LB'));
    expect(suggestionsFor(data({ workouts: docs(bw) }), [], {}, NOW, day(7))).toEqual([]);
  });

  it('ok → applied after the next session', () => {
    const decided = `${day(7)}T12:00:00.000Z`;
    const ok: Suggestion = { id: 'bench-1', kind: 'reset', ex: 'bench', kg: 54, status: 'ok', createdAt: NOW, decidedAt: decided };
    const before = suggestionsFor(data({ workouts: docs(plateau()) }), [ok], {}, NOW, day(7));
    expect(before).toEqual([ok]);
    const after = suggestionsFor(data({ workouts: docs([...plateau(), wo(day(9), 'bench', [S(54, 10)])]) }), [ok], { bench: decided }, NOW, day(7));
    expect(after).toEqual([{ ...ok, status: 'applied' }]);
  });
});
