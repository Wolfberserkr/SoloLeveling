import { describe, expect, it } from 'vitest';
import { dn, emptyData, iso, type CycleDoc, type RideDoc, type VikingData, type WorkoutDoc } from '../supabase/functions/_shared/viking/logic.ts';
import { garminDate } from '../supabase/functions/_shared/viking/garmin.ts';
import { endOfDay, gymTick, planAhead, rideTick, tickId, type PlanCtx } from '../supabase/functions/_shared/viking/planner.ts';

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
const ctx = (t: string): PlanCtx => ({ today: t, afterNight: new Set(), overrides: {}, resets: {} });
const tick = (date: string, d: number, savedAt = 0): CycleDoc => ({ date, day: d, status: 'done', savedAt });
const ride = (date: string, minutes: number, code?: RideDoc['code']): RideDoc =>
  ({ date, type: code === 'H1' || code === 'H2' || code === 'H3' ? 'hard' : 'easy', minutes, ...(code ? { code } : {}) });

describe('viking planner', () => {
it('tickId: <date>_auto_<day>', () => {
  expect(tickId('2026-11-25', 3)).toBe('2026-11-25_auto_3');
});

it('planAhead: no settings → []', () => { expect(planAhead(emptyData(), ctx(day(0)))).toEqual([]); });
it('planAhead: starts at the current cycle day, one per date', () => {
  const D = data({ workouts: { a: workout(day(0), 'UA', []) } });
  const p = planAhead(D, ctx(day(1)));
  expect(p.map((x) => x.cycleDay)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  expect(p[0]).toMatchObject({ kind: 'gym', session: 'LA' });
  expect(p[0].garmin!.name).toBe(`Viking Lower A (${garminDate(day(1))})`);
  expect(p[1]).toMatchObject({ kind: 'ride', ride: { code: 'H1' } });
  expect(p[5].kind).toBe('rest'); // day 7, phase 1: optional R1 only
});
it('planAhead: day 1 is tomorrow when today already has a workout', () => {
  const D = data({ workouts: { a: workout(day(0), 'UA', []) } });
  const p = planAhead(D, ctx(day(0)));
  expect(p[0]).toMatchObject({ date: day(1), cycleDay: 2 });
  expect(p.map((x) => x.date)).toEqual([1, 2, 3, 4, 5, 6, 7].map(day));
});
it('planAhead: day 1 is tomorrow when today already has a tick', () => {
  const D = data({ cycle: { t: tick(day(0), 3) } });
  expect(planAhead(D, ctx(day(0)))[0]).toMatchObject({ date: day(1), cycleDay: 4, kind: 'gym', session: 'UB' });
});
it('planAhead: names, descriptions and markers', () => {
  const D = data({ workouts: { a: workout(day(0), 'UA', []) } });
  const p = planAhead(D, { ...ctx(day(1)), windows: { [day(1)]: '16:30–18:30' } });
  const g = p[0].garmin!;
  expect(g.sport).toBe('strength_training');
  expect(g.dto.description).toBe(`Project Viking week 1 · Foundation cut. Train 16:30–18:30 [viking:${g.hash}]`);
  expect(p[0].targets!.squat).toBeDefined();
  const r = p[1];
  expect(r.ride).toMatchObject({ code: 'H1', minutes: 50 });
  expect(r.garmin!.name).toBe(`Viking H1 · Hill repeats 50 min (${garminDate(day(2))})`);
  expect(r.garmin!.sport).toBe('cycling');
  expect(r.garmin!.dto.description).toBe(`Project Viking week 1 · Foundation cut [viking:${r.garmin!.hash}]`);
  expect(p[4]).toMatchObject({ kind: 'ride', ride: { code: 'E1', minutes: 60 } });
  expect(p[4].garmin!.name).toBe(`Viking E1 · Endurance 60 min (${garminDate(day(5))})`);
  expect(p[6]).toMatchObject({ kind: 'rest', cycleDay: 8 });
  expect(p[6].garmin).toBeUndefined();
});
it('planAhead: a window change alone keeps the hash', () => {
  const D = data({ workouts: { a: workout(day(0), 'UA', []) } });
  const a = planAhead(D, ctx(day(1)));
  const b = planAhead(D, { ...ctx(day(1)), windows: { [day(1)]: '06:00–08:00', [day(2)]: '16:30–18:30' } });
  expect(b[0].garmin!.hash).toBe(a[0].garmin!.hash);
  expect(b[1].garmin!.hash).toBe(a[1].garmin!.hash);
});
it('planAhead: a deload week gym day is named · deload', () => {
  const D = data({ cycle: { t: tick(day(35), 1) } }); // week 6
  const p = planAhead(D, ctx(day(36)));
  expect(p[0]).toMatchObject({ kind: 'gym', session: 'LA' });
  expect(p[0].garmin!.name).toBe(`Viking Lower A · deload (${garminDate(day(36))})`);
  expect(p[0].garmin!.dto.description).toMatch(/^Project Viking week 6 · Foundation cut \[viking:/);
});
it('planAhead: day 3 is H2 when an H1 was ridden in the last 8 days', () => {
  // phase 2 (cap 2), so the earlier H1 doesn't also trip the phase-1 cap of 1
  const D = data({ settings: { startDate: START, startWeight: 102, phaseMode: '2', kcalAdjust: 0 }, workouts: { a: workout(day(0), 'UA', []) }, rides: { r: { date: day(-3), type: 'hard', minutes: 50, code: 'H1' } } });
  expect(planAhead(D, ctx(day(1)))[1].ride!.code).toBe('H2');
});
it('planAhead: an H1 exactly 8 days back makes day 3 an H2, uncapped, even in phase 1', () => {
  // day(2) is the hard-ride day; the earlier H1 sits on day(2 − 8) = day(−6)
  const D = data({ workouts: { a: workout(day(0), 'UA', []) }, rides: { r: { date: day(-6), type: 'hard', minutes: 50, code: 'H1' } } });
  expect(planAhead(D, ctx(day(1)))[1].ride).toMatchObject({ code: 'H2' });
  expect(planAhead(D, ctx(day(1)))[1].ride!.from).toBeUndefined();
});
it('planAhead: an H1 9 days back leaves day 3 an H1', () => {
  const D = data({ workouts: { a: workout(day(0), 'UA', []) }, rides: { r: ride(day(-7), 50, 'H1') } });
  expect(planAhead(D, ctx(day(1)))[1].ride).toMatchObject({ code: 'H1' });
});
it('planAhead: phase 2 day 7 is H3, or H2 after a planned/logged H3', () => {
  const s2 = { startDate: START, startWeight: 102, phaseMode: '2' as const, kcalAdjust: 0 };
  const D = data({ settings: s2, cycle: { t: tick(day(0), 6) } });
  expect(planAhead(D, ctx(day(1)))[0]).toMatchObject({ kind: 'ride', cycleDay: 7, ride: { code: 'H3' } });
  const D2 = data({ settings: s2, cycle: { t: tick(day(0), 6) }, rides: { r: ride(day(-6), 45, 'H3') } });
  expect(planAhead(D2, ctx(day(1)))[0].ride).toMatchObject({ code: 'H2' });
  // a full 16-day plan alternates: the second day 7 sees the planned H3 8 days earlier
  const p = planAhead(D, ctx(day(1)), 16);
  expect(p[8]).toMatchObject({ cycleDay: 7, ride: { code: 'H2' } });
});
it('planAhead: planned hard rides count against the cap', () => {
  // phase 2, cap 2: H1 logged on day(-1); planned day 3 = H2 (window) → 2 in 8 days;
  // day 7 = H3 would be the third → capped to E1
  const s2 = { startDate: START, startWeight: 102, phaseMode: '2' as const, kcalAdjust: 0 };
  const D = data({ settings: s2, workouts: { a: workout(day(0), 'UA', []) }, rides: { r: ride(day(-1), 50, 'H1') } });
  const p = planAhead(D, ctx(day(1)));
  expect(p[1].ride).toMatchObject({ code: 'H2' });
  expect(p[5].ride).toMatchObject({ code: 'E1', minutes: 60, from: 'H3' });
  expect(p[5].ride!.reason).toMatch(/^hard-ride cap/);
});
it('planAhead: phase B day 6 is L1 until one is ridden in the break, then E1', () => {
  const sB = { startDate: START, startWeight: 102, phaseMode: 'B' as const, kcalAdjust: 0 };
  const D = data({ settings: sB, cycle: { t: tick(day(0), 5) } });
  expect(planAhead(D, ctx(day(1)))[0]).toMatchObject({ kind: 'ride', ride: { code: 'L1', minutes: 120 } });
  const D2 = data({ settings: sB, cycle: { t: tick(day(0), 5) }, rides: { r: ride(day(0), 130, 'L1') } });
  expect(planAhead(D2, ctx(day(1)))[0].ride).toMatchObject({ code: 'E1', minutes: 90 });
});
it('planAhead: days parameter', () => {
  expect(planAhead(data(), ctx(day(0)), 3)).toHaveLength(3);
});

it('endOfDay: missed gym day slides; rest ticks done; phase-1 day 7 ticks skip', () => {
  expect(endOfDay(data({ workouts: { a: workout(day(0), 'UA', []) } }), day(1), 1)).toBe('slid');
  expect((endOfDay(data({ cycle: { t: { date: day(0), day: 7, status: 'done', savedAt: 0 } } }), day(1), 1) as any).doc).toMatchObject({ day: 8, status: 'done' });
  expect((endOfDay(data({ cycle: { t: { date: day(0), day: 6, status: 'done', savedAt: 0 } } }), day(1), 1) as any).doc).toMatchObject({ day: 7, status: 'skip' });
});
it('endOfDay: ids, ride days slide, phase-2 day 7 slides, existing tick → null', () => {
  expect(endOfDay(data({ cycle: { t: tick(day(0), 7) } }), day(1), 5)).toEqual({
    id: `${day(1)}_auto_8`, doc: { date: day(1), day: 8, status: 'done', savedAt: 5 },
  });
  expect(endOfDay(data({ cycle: { t: tick(day(0), 2) } }), day(1), 1)).toBe('slid'); // day 3 ride
  const s2 = { startDate: START, startWeight: 102, phaseMode: '2' as const, kcalAdjust: 0 };
  expect(endOfDay(data({ settings: s2, cycle: { t: tick(day(0), 6) } }), day(1), 1)).toBe('slid');
  expect(endOfDay(data({ cycle: { t: tick(day(1), 2) } }), day(1), 1)).toBeNull();
});
it('gymTick: a different session realigns', () => {
  expect(gymTick(data({ workouts: { a: workout(day(0), 'UA', []) } }), day(1), 'UB', 1)).toMatchObject({ realigned: true, doc: { day: 4 } });
});
it('gymTick: the matching session ticks the current day', () => {
  expect(gymTick(data({ cycle: { t: tick(day(0), 1) } }), day(1), 'LA', 7)).toEqual({
    id: `${day(1)}_auto_2`, doc: { date: day(1), day: 2, status: 'done', savedAt: 7 }, realigned: false,
  });
});
it('gymTick: the workout being ticked does not count as history', () => {
  // no ticks yet; D already holds today's LA workout → still day 2, not a realign
  const D = data({ workouts: { a: workout(day(0), 'UA', []), b: workout(day(1), 'LA', []) } });
  expect(gymTick(D, day(1), 'LA', 1)).toMatchObject({ realigned: false, doc: { day: 2 } });
});
it('settle: late import after midnight', () => {
  const D = data({ workouts: { a: workout(day(0), 'UA', []) } });
  expect(endOfDay(D, day(1), 1)).toBe('slid');
  const t = gymTick(D, day(1), 'LA', 2)!;
  expect(t.doc).toMatchObject({ date: day(1), day: 2, status: 'done' });
  const D2 = { ...D, cycle: { [t.id]: t.doc } };
  expect(planAhead(D2, ctx(day(2)))[0].cycleDay).toBe(3);
  expect(endOfDay(D2, day(1), 3)).toBeNull();
  expect(gymTick(D2, day(1), 'LA', 4)).toBeNull();
});
it('rideTick: 2 × 15 min counts', () => {
  // cycle at day 3 (a ride day): two 15-min rides dated today → done
  const D = data({ cycle: { t: tick(day(0), 2) }, rides: { a: ride(day(1), 15, 'H1'), b: ride(day(1), 15, 'E1') } });
  expect(rideTick(D, day(1), 9)).toEqual({ id: `${day(1)}_auto_3`, doc: { date: day(1), day: 3, status: 'done', savedAt: 9 } });
});
it('rideTick: under 20 min total → null', () => {
  const D = data({ cycle: { t: tick(day(0), 2) }, rides: { a: ride(day(1), 15, 'H1'), b: ride(day(0), 30, 'E1') } });
  expect(rideTick(D, day(1), 9)).toBeNull();
});
it('rideTick: a stale gym-day ride never ticks a later ride day', () => {
  // the ride on day(0) was a gym day (day 2, ticked by its workout); the cycle is now at day 3
  const D = data({ cycle: { t: tick(day(0), 2) }, rides: { a: ride(day(-1), 40, 'E1') } });
  expect(rideTick(D, day(-1), 9)).toBeNull();
  // a ride dated the same day as the latest tick (a gym day) → that date already has a tick
  const D2 = data({ cycle: { t: tick(day(0), 2) }, rides: { a: ride(day(0), 40, 'E1') } });
  expect(rideTick(D2, day(0), 9)).toBeNull();
});
it('rideTick: a ride on a gym cycle day → null; rest day 8 → null', () => {
  expect(rideTick(data({ cycle: { t: tick(day(0), 1) } , rides: { a: ride(day(1), 40, 'E1') } }), day(1), 1)).toBeNull();
  expect(rideTick(data({ cycle: { t: tick(day(0), 7) } , rides: { a: ride(day(1), 40, 'E1') } }), day(1), 1)).toBeNull();
});
it('rideTick: phase-1 day 7 (optional R1) ticks done when ridden', () => {
  const D = data({ cycle: { t: tick(day(0), 6) }, rides: { a: ride(day(1), 30, 'R1') } });
  expect(rideTick(D, day(1), 1)!.doc).toMatchObject({ day: 7, status: 'done' });
});

// Each swap: cycle at day 3 (H1) on the plan's first date.
const swapExpect = { code: 'E1', minutes: 60, from: 'H1' };
it('rides: swap reason deload week', () => {
  const D = data({ cycle: { t: tick(day(35), 2) } }); // week 6
  const p = planAhead(D, ctx(day(36)));
  expect(p[0].ride).toMatchObject({ ...swapExpect, reason: 'deload week' });
  expect(p[0].reason).toBe('deload week');
  expect(p[0].garmin!.name).toBe(`Viking E1 · Endurance 60 min (${garminDate(day(36))})`);
  expect(p[0].garmin!.dto.description).toBe(`Project Viking week 6 · Foundation cut. deload week [viking:${p[0].garmin!.hash}]`);
});
it('rides: swap reason hard-ride cap', () => {
  const D = data({ cycle: { t: tick(day(0), 2) }, rides: { r: ride(day(-1), 45, 'H2') } }); // phase 1 cap 1
  const r = planAhead(D, ctx(day(1)))[0].ride!;
  expect(r).toMatchObject(swapExpect);
  expect(r.reason).toMatch(/^hard-ride cap/);
});
it('rides: swap reason after a night shift', () => {
  const D = data({ cycle: { t: tick(day(0), 2) } });
  const p = planAhead(D, { ...ctx(day(1)), afterNight: new Set([day(1)]) });
  expect(p[0].ride).toMatchObject({ ...swapExpect, reason: 'after a night shift' });
});
it('rides: swap reason readiness', () => {
  const D = data({ cycle: { t: tick(day(0), 2) } });
  const r = planAhead(D, { ...ctx(day(1)), health: { hrvStatus: 'LOW' } })[0].ride!;
  expect(r).toMatchObject(swapExpect);
  expect(r.reason).toMatch(/^readiness/);
  expect(r.reason).toBe('readiness: HRV LOW');
});
it('rides: readiness texts, first match only; good health keeps the ride', () => {
  const D = data({ cycle: { t: tick(day(0), 2) } });
  const why = (health: PlanCtx['health']) => planAhead(D, { ...ctx(day(1)), health })[0].ride!.reason;
  expect(why({ readiness: 35, sleepH: 5.2 })).toBe('readiness 35');
  expect(why({ sleepH: 5.2 })).toBe('readiness: sleep 5.2 h');
  expect(why({ bodyBattery: 22 })).toBe('readiness: body battery 22');
  expect(why({ sleepStress: 34 })).toBe('readiness: sleep stress 34');
  expect(why({ hrvStatus: 'UNBALANCED' })).toBe('readiness: HRV UNBALANCED');
  expect(why({ hrvStatus: 'BALANCED', readiness: 70, sleepH: 7.5, bodyBattery: 80, sleepStress: 12 })).toBeUndefined();
});
it('rides: readiness swaps today only', () => {
  const D = data({ workouts: { a: workout(day(0), 'UA', []) } });
  const p = planAhead(D, { ...ctx(day(1)), health: { hrvStatus: 'LOW' } });
  expect(p[1].ride).toMatchObject({ code: 'H1' });
  expect(p[1].ride!.from).toBeUndefined();
});

it('planAhead: a frozen today is kept when health changes, dropped when the cycle moved', () => {
  const D = data({ cycle: { t1: tick(day(-1), 2, 1) } });
  const f = planAhead(D, ctx(day(0)))[0];
  expect(f).toMatchObject({ date: day(0), cycleDay: 3, ride: { code: 'H1' } });
  const frozen = { date: day(0), day: f };
  const p = planAhead(D, { ...ctx(day(0)), health: { hrvStatus: 'LOW' }, frozen });
  expect(p[0]).toEqual(f);
  expect(p[1]).toMatchObject({ date: day(1), cycleDay: 4 });
  // without the freeze the same health swaps today's ride
  expect(planAhead(D, { ...ctx(day(0)), health: { hrvStatus: 'LOW' } })[0].ride).toMatchObject({ code: 'E1', from: 'H1' });
  // a late realign of yesterday → current 4; today still has no tick → freeze ignored
  const D2 = data({ cycle: { t1: tick(day(-1), 2, 1), t2: tick(day(-1), 3, 2) } });
  expect(planAhead(D2, { ...ctx(day(0)), health: { hrvStatus: 'LOW' }, frozen })[0]).toMatchObject({ date: day(0), cycleDay: 4 });
});
it('planAhead: a freeze is dropped once today has a tick, and ignored for another date', () => {
  const D = data({ cycle: { t1: tick(day(-1), 2, 1) } });
  const f = planAhead(D, ctx(day(0)))[0];
  const D2 = data({ cycle: { t1: tick(day(-1), 2, 1), t2: tick(day(0), 3, 2) } });
  // cycle moved to 4 as well, but the "today has a tick" rule alone puts day 1 on tomorrow
  expect(planAhead(D2, { ...ctx(day(0)), frozen: { date: day(0), day: f } })[0]).toMatchObject({ date: day(1), cycleDay: 4 });
  const p = planAhead(D, { ...ctx(day(0)), health: { hrvStatus: 'LOW' }, frozen: { date: day(-1), day: f } });
  expect(p[0].ride).toMatchObject({ code: 'E1', from: 'H1' });
});
});
