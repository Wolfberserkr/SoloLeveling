import { describe, expect, it } from 'vitest';
import { BENCHMARKS } from '@/features/viking/bikePlan';
import {
  bike, codesFor, cycleDay, dayRides, mmss, parseTime, prescribe, zoneLabel,
} from '@/features/viking/bikeLogic';
import {
  dn, emptyData, iso, viking, type CycleDoc, type RideDoc, type VikingData, type WorkoutDoc,
} from '@/features/viking/vikingLogic';

const START = '2026-01-05';
const day = (offset: number) => iso(dn(START) + offset);
const wkDay = (wk: number, d = 0) => day((wk - 1) * 7 + d);
function data(over: Partial<VikingData> = {}): VikingData {
  return {
    ...emptyData(),
    settings: { startDate: START, startWeight: 102, phaseMode: 'auto', kcalAdjust: 0 },
    ...over,
  };
}
const ride = (date: string, code: RideDoc['code'], minutes = 60, savedAt = 0): RideDoc =>
  ({ date, code, type: code === 'H1' || code === 'H2' || code === 'H3' ? 'hard' : 'easy', minutes, savedAt });
const tick = (date: string, d: number, savedAt = 0): CycleDoc => ({ date, day: d, status: 'done', savedAt });
const wo = (date: string, session: WorkoutDoc['session']): WorkoutDoc =>
  ({ date, session, week: 1, phase: '1', deload: false, entries: [{ ex: 'x', sets: [{ kg: 1, reps: 1 }] }], savedAt: 0 });
const B = (d: VikingData) => bike(viking(d));

describe('cycle', () => {
  it('starts at day 1 (Upper A + optional R1)', () => {
    const t = B(data()).today(day(0));
    expect(t.day).toBe(1);
    expect(t.cd.gym).toBe('UA');
    expect(t.rx.map((r) => r.code)).toEqual(['R1']);
    expect(t.optional).toBe(true);
  });

  it('advances on ticks, not weekdays, and wraps 8 → 1', () => {
    expect(B(data({ cycle: { a: tick(day(0), 2) } })).current().day).toBe(3);
    expect(B(data({ cycle: { a: tick(day(0), 8) } })).current().day).toBe(1);
    // ten days later, still the day after the last tick
    expect(B(data({ cycle: { a: tick(day(0), 3) } })).today(day(10)).day).toBe(4);
  });

  it('lines up behind the last logged gym session when nothing is ticked', () => {
    expect(B(data({ workouts: { w: wo(day(0), 'LA') } })).current().day).toBe(3);
  });

  it('day 3 offers the hard rides, day 7 differs in phase 1', () => {
    expect(dayRides(cycleDay(3), '1').codes).toEqual(['H1', 'H2']);
    expect(dayRides(cycleDay(7), '1')).toEqual({ codes: ['R1'], optional: true });
    expect(dayRides(cycleDay(7), '2')).toEqual({ codes: ['H2', 'H3'], optional: false });
  });

  it('hides H3 sprints before phase 2', () => {
    expect(codesFor('1')).not.toContain('H3');
    expect(codesFor('2')).toContain('H3');
    expect(codesFor('B')).toContain('H3');
  });
});

describe('prescription', () => {
  it('builds hill repeats from 4 to 6 climbs in phase 1', () => {
    expect(prescribe('H1', 1, '1', false).detail).toContain('4 × 3 min');
    expect(prescribe('H1', 3, '1', false).detail).toContain('5 × 3 min');
    expect(prescribe('H1', 11, '1', false).detail).toContain('6 × 3 min');
    expect(prescribe('H1', 14, '2', false).detail).toContain('5–6 × 4 min');
  });

  it('grows endurance 60 → 90 min across phase 1', () => {
    expect(prescribe('E1', 1, '1', false).min).toEqual([60, 60]);
    expect(prescribe('E1', 12, '1', false).min).toEqual([90, 90]);
    expect(prescribe('E1', 20, '2', false).min).toEqual([90, 90]);
  });

  it('deload swaps hard rides for 60 min of Z1–Z2 and caps the rest', () => {
    const h = prescribe('H2', 6, '1', true);
    expect(h).toMatchObject({ code: 'E1', from: 'H2', min: [60, 60], zones: ['Z1', 'Z2'] });
    expect(prescribe('E1', 6, '1', true).min[1]).toBeLessThanOrEqual(60);
  });

  it('deload weeks change the suggestion on the hard-ride day', () => {
    const d = data({ cycle: { a: tick(wkDay(6), 2) } });
    const t = B(d).today(wkDay(6, 1));
    expect(t.deload).toBe(true);
    expect(t.rx.every((r) => r.code === 'E1' && r.min[1] <= 60)).toBe(true);
    expect(B(data({ cycle: { a: tick(wkDay(5), 2) } })).today(wkDay(5, 1)).rx.map((r) => r.code)).toEqual(['H1', 'H2']);
  });
});

describe('rules', () => {
  it('warns on a hard ride the day before a Lower session', () => {
    // Day 1 done → day 2 (Lower A) is next: a hard ride now lands before it.
    const d = data({ cycle: { a: tick(day(0), 1) } });
    const f = B(d).rideFlags({ date: day(1), code: 'H1', type: 'hard', minutes: 60 }, day(1), true);
    expect(f.map((x) => x.t)).toContain('Lower day next');
    // Same ride logged after the fact, with Lower B the next day.
    const d2 = data({ rides: { r: ride(day(3), 'H2') }, workouts: { w: wo(day(4), 'LB') } });
    expect(B(d2).rideFlags(d2.rides.r, day(5)).map((x) => x.t)).toContain('Hard ride before a Lower day');
  });

  it('no Lower warning on the plan’s own hard-ride day', () => {
    const d = data({ cycle: { a: tick(day(1), 2) } });
    const f = B(d).rideFlags({ date: day(2), code: 'H1', type: 'hard', minutes: 60 }, day(2), true);
    expect(f).toEqual([]);
  });

  it('caps hard rides at 1 per 8 days in phase 1', () => {
    const d = data({ rides: { a: ride(day(0), 'H1') } });
    const f = B(d).rideFlags({ date: day(5), code: 'H2', type: 'hard', minutes: 60 }, day(5), true);
    expect(f.map((x) => x.t)).toContain('Over the hard-ride cap');
    // outside the 8-day window it's fine
    const ok = B(d).rideFlags({ date: day(8), code: 'H2', type: 'hard', minutes: 60 }, day(8), true);
    expect(ok.map((x) => x.t)).not.toContain('Over the hard-ride cap');
  });

  it('caps hard rides at 2 per 8 days in phase 2', () => {
    const w = (n: number) => wkDay(14, n);
    const d = data({ rides: { a: ride(w(0), 'H1'), b: ride(w(2), 'H2') } });
    const f = B(d).rideFlags({ date: w(4), code: 'H3', type: 'hard', minutes: 45 }, w(4), true);
    expect(f.map((x) => x.t)).toContain('Over the hard-ride cap');
    const two = data({ rides: { a: ride(w(0), 'H1') } });
    expect(B(two).rideFlags({ date: w(4), code: 'H3', type: 'hard', minutes: 45 }, w(4), true).map((x) => x.t))
      .not.toContain('Over the hard-ride cap');
  });

  it('flags hard and long rides in a deload week', () => {
    const b = B(data());
    expect(b.rideFlags({ date: wkDay(6, 2), code: 'H1', type: 'hard', minutes: 50 }, wkDay(6, 2), true).map((x) => x.t))
      .toContain('Hard ride in a deload week');
    expect(b.rideFlags({ date: wkDay(6, 2), code: 'E1', type: 'easy', minutes: 90 }, wkDay(6, 2), true).map((x) => x.t))
      .toContain('Long for a deload');
  });

  it('counts legacy rides by their stored type', () => {
    const d = data({ rides: { a: { date: day(0), type: 'hard', minutes: 95 } } });
    expect(B(d).hardIn(dn(day(3)))).toBe(1);
  });
});

describe('weekly summary', () => {
  it('totals Z2 minutes (entered or estimated) against the phase target', () => {
    const d = data({ rides: {
      a: ride(day(0), 'E1', 70),
      b: { ...ride(day(2), 'H1', 55), z2: 20 },
      c: ride(day(3), 'R1', 30),
    } });
    const w = B(d).week(day(4));
    expect(w).toMatchObject({ z2: 90, z2Target: 120, z2Est: true, minutes: 155, hard: 1, cap: 1, rides: 3 });
    expect(B(data()).week(wkDay(20)).z2Target).toBe(150);
  });
});

describe('benchmarks', () => {
  it('starts every series at the baseline', () => {
    const b = B(data());
    expect(b.series('aerobic')[0]).toMatchObject({ val: 1246, hr: 118, base: true });
    expect(b.series('climb')[0]).toMatchObject({ val: 257, hr: 174 });
    expect(b.series('cadence')[0]).toMatchObject({ val: 70 });
    expect(BENCHMARKS.map((x) => x.id)).toEqual(['aerobic', 'climb', 'cadence']);
  });

  it('adds retests and E1 cadence', () => {
    const d = data({
      benchmarks: { x: { date: '2026-12-01', bench: 'aerobic', sec: 1200, hr: 125, source: 'manual', savedAt: 1 } },
      rides: { r: { ...ride('2026-11-20', 'E1'), cadence: 78 } },
    });
    expect(B(d).series('aerobic').map((p) => p.val)).toEqual([1246, 1200]);
    expect(B(d).series('cadence').map((p) => p.val)).toEqual([70, 78]);
  });

  it('prompts a retest at the end of a deload week until both tests are in', () => {
    expect(B(data()).retestDue(wkDay(6, 1))).toBeNull();
    expect(B(data()).retestDue(wkDay(6, 5))).toEqual({ wk: 6 });
    expect(B(data()).retestDue(wkDay(7, 1))).toEqual({ wk: 6 });
    expect(B(data()).retestDue(wkDay(7, 4))).toBeNull();
    const done = data({ benchmarks: {
      a: { date: wkDay(6, 5), bench: 'aerobic', sec: 1200, source: 'manual', savedAt: 1 },
      c: { date: wkDay(6, 6), bench: 'climb', sec: 250, source: 'manual', savedAt: 2 },
    } });
    expect(B(done).retestDue(wkDay(7, 0))).toBeNull();
  });
});

describe('formatting', () => {
  it('reads and prints m:ss', () => {
    expect(parseTime('20:46')).toBe(1246);
    expect(parseTime('257')).toBe(257);
    expect(Number.isNaN(parseTime('abc'))).toBe(true);
    expect(mmss(1246)).toBe('20:46');
    expect(mmss(257)).toBe('4:17');
  });

  it('labels zones with their HR range', () => {
    expect(zoneLabel(['Z2'])).toBe('Z2 · 115–135 bpm');
    expect(zoneLabel(['Z1'])).toBe('Z1 · under 115 bpm');
    expect(zoneLabel(['Z4', 'Z5'])).toBe('Z4–Z5 · 151–186 bpm');
  });
});
