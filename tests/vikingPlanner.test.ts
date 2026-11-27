import { describe, expect, it } from 'vitest';
import { dn, emptyData, iso, viking, type CycleDoc, type RideDoc, type VikingData, type WorkoutDoc } from '../supabase/functions/_shared/viking/logic.ts';
import { bike } from '../supabase/functions/_shared/viking/bikeLogic.ts';
import { garminDate } from '../supabase/functions/_shared/viking/garmin.ts';
import { endOfDay, fixTick, gymTick, planAhead, planOrder, rideTick, tickId, type PlanCtx } from '../supabase/functions/_shared/viking/planner.ts';
import { resolveMoves } from '../supabase/functions/_shared/viking/moves.ts';

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
it('planOrder: fills open boxes in order, skipping filled', () => {
  const D = data({ cycle: { a: tick(day(0), 1), b: tick(day(1), 2), c: tick(day(2), 4) } });
  expect(planOrder(D, ctx(day(3))).map((x) => x.day)).toEqual([3, 5, 6, 7, 8, 1, 2]);
});
it('planOrder: a pin places its box on its date', () => {
  const D = data({ cycle: { a: tick(day(0), 1) } });
  const c = { ...ctx(day(1)), pins: { [day(3)]: 2 } };
  expect(planOrder(D, c).map((x) => x.day).slice(0, 4)).toEqual([3, 4, 2, 5]);
});
it('planOrder: a day off moves everything back a day', () => {
  const D = data({ cycle: { a: tick(day(0), 1) } });
  const c = { ...ctx(day(1)), pins: { [day(2)]: 0 } };
  expect(planOrder(D, c).map((x) => x.day).slice(0, 4)).toEqual([2, 0, 3, 4]);
});
it('planOrder: pins for filled boxes are ignored', () => {
  const D = data({ cycle: { a: tick(day(0), 1) } });
  const c = { ...ctx(day(1)), pins: { [day(2)]: 1 } };
  expect(planOrder(D, c).map((x) => x.day).slice(0, 3)).toEqual([2, 3, 4]);
});
it('planAhead: a day off is a rest day with no workout', () => {
  const D = data({ cycle: { a: tick(day(0), 1) } });
  const p = planAhead(D, { ...ctx(day(1)), pins: { [day(2)]: 0 } });
  expect(p[1]).toEqual({ date: day(2), cycleDay: 0, kind: 'rest', reason: 'day off' });
  expect(p[2]).toMatchObject({ cycleDay: 3 });
});
it('planAhead: a hard ride pinned before Lower becomes E1', () => {
  // ticks 1, 2 → order 3 (H1), 4, 5 (LB). Pin box 3 the day before LB.
  const D = data({ cycle: { a: tick(day(0), 1), b: tick(day(1), 2) } });
  const p = planAhead(D, { ...ctx(day(2)), pins: { [day(3)]: 3 } });
  expect(p.map((x) => x.cycleDay).slice(0, 3)).toEqual([4, 3, 5]);
  expect(p[1].ride).toMatchObject({ code: 'E1', from: 'H1', reason: 'Lower B tomorrow' });
});
it('planAhead: the frozen day is kept only when no pin on today differs', () => {
  const D = data({ cycle: { a: tick(day(0), 1) } });
  const fz = planAhead(D, ctx(day(1)))[0];
  const frozen = { date: day(1), day: { ...fz, reason: 'frozen' } };
  expect(planAhead(D, { ...ctx(day(1)), frozen })[0].reason).toBe('frozen');
  const kept = planAhead(D, { ...ctx(day(1)), frozen, pins: { [day(1)]: 2 } });
  expect(kept[0].reason).toBe('frozen');
  expect(kept.filter((x) => x.cycleDay === 2)).toHaveLength(1);
  const p = planAhead(D, { ...ctx(day(1)), frozen, pins: { [day(1)]: 3 } });
  expect(p[0]).toMatchObject({ cycleDay: 3 });
  expect(p[0].reason).not.toBe('frozen');
});

it('planAhead: a pin moving the frozen day\'s box elsewhere drops the freeze', () => {
  const D = data({ cycle: { a: tick(day(0), 1), b: tick(day(1), 2) } });
  const fz = planAhead(D, ctx(day(2)))[0]; // box 3
  const frozen = { date: day(2), day: { ...fz, reason: 'frozen' } };
  const p = planAhead(D, { ...ctx(day(2)), frozen, pins: { [day(4)]: 3 } });
  expect(p[0].cycleDay).toBe(4);
  expect(p[0].reason).not.toBe('frozen');
  expect(p.filter((x) => x.cycleDay === 3).map((x) => x.date)).toEqual([day(4)]);
});
it('planAhead: a day-off pin on today drops the freeze', () => {
  const D = data({ cycle: { a: tick(day(0), 1), b: tick(day(1), 2) } });
  const fz = planAhead(D, ctx(day(2)))[0]; // box 3
  const frozen = { date: day(2), day: { ...fz, reason: 'frozen' } };
  const p = planAhead(D, { ...ctx(day(2)), frozen, pins: { [day(2)]: 0 } });
  expect(p[0]).toEqual({ date: day(2), cycleDay: 0, kind: 'rest', reason: 'day off' });
  expect(p.filter((x) => x.cycleDay === 3).map((x) => x.date)).toEqual([day(3)]);
  expect(p[1].reason).not.toBe('frozen');
});
it('planAhead: a frozen hard ride with Lower B pinned tomorrow becomes E1', () => {
  // ticks 1, 2 → today's frozen day is box 3 (H1); the owner pins LB (box 5) on tomorrow.
  const D = data({ cycle: { a: tick(day(0), 1), b: tick(day(1), 2) } });
  const fz = planAhead(D, ctx(day(2)))[0];
  expect(fz).toMatchObject({ cycleDay: 3, ride: { code: 'H1' } });
  const frozen = { date: day(2), day: { ...fz, reason: 'frozen' } };
  const p = planAhead(D, { ...ctx(day(2)), frozen, pins: { [day(3)]: 5 } });
  expect(p[0]).toMatchObject({ date: day(2), cycleDay: 3, reason: 'Lower B tomorrow' });
  expect(p[0].ride).toMatchObject({ code: 'E1', from: 'H1', reason: 'Lower B tomorrow' });
  expect(p[0].ride!.minutes).toBeLessThanOrEqual(60);
  expect(p[1]).toMatchObject({ date: day(3), cycleDay: 5, session: 'LB' });
  expect(planOrder(D, { ...ctx(day(2)), frozen, pins: { [day(3)]: 5 } }).map((x) => x.day).slice(0, 3)).toEqual([3, 5, 4]);
  // the same freeze with no Lower tomorrow stays as it was
  expect(planAhead(D, { ...ctx(day(2)), frozen, pins: { [day(3)]: 4 } })[0].reason).toBe('frozen');
});
it('viking_move preview: pinning LB tomorrow after a frozen hard ride shows today as E1', () => {
  const D = data({ cycle: { a: tick(day(0), 1), b: tick(day(1), 2) } });
  const frozen = { date: day(2), day: { ...planAhead(D, ctx(day(2)))[0], reason: 'frozen' } };
  const r = resolveMoves(D, {}, [{ what: 'LB', date: day(3) }], day(2));
  expect(r.errors).toEqual([]);
  // as moveOnce builds it: the freeze and the new pins
  const p = planAhead(D, { ...ctx(day(2)), frozen, pins: r.pins });
  expect(p[0].ride).toMatchObject({ code: 'E1', from: 'H1', reason: 'Lower B tomorrow' });
});
// viking_fix creating a session: ticks 1 (d0), 2 (d1), 4 (d3); the fix lands on d2, before the latest tick.
const fixed = (extra: Record<string, CycleDoc> = {}) =>
  data({ cycle: { a: tick(day(0), 1, 1), b: tick(day(1), 2, 2), c: tick(day(3), 4, 3), ...extra } });
const lapOf = (D: VikingData) => bike(viking(D)).lap();
const withTick = (D: VikingData, t: { id: string; doc: CycleDoc }) => ({ ...D, cycle: { ...D.cycle, [t.id]: t.doc } });
it('fixTick: a back-dated session on a box already done writes no tick and never opens a lap', () => {
  expect(fixTick(fixed(), day(2), 'UA', 10)).toEqual({ none: 'done' });
  // the double-Upper-B probe: UB ticked on d3, a fix creates UB on d2
  expect(fixTick(fixed(), day(2), 'UB', 10)).toEqual({ none: 'done' });
  expect(bike(viking(fixed())).current().day).toBe(3);
});
it('fixTick: a back-dated session on an open box fills it, with no new lap', () => {
  const D = fixed();
  const t = fixTick(D, day(2), 'LB', 10);
  expect(t).toEqual({ id: tickId(day(2), 5), doc: { date: day(2), day: 5, status: 'done', savedAt: 10 }, early: [], newLap: false });
  const D2 = withTick(D, t as { id: string; doc: CycleDoc });
  expect(lapOf(D2).boxes.map((b) => b.status)).toEqual(['done', 'done', 'open', 'done', 'done', 'open', 'open', 'open']);
  expect(lapOf(D2).passed).toEqual(lapOf(D).passed);
  expect(bike(viking(D2)).current().day).toBe(3);
  // the rest of the lap is planned once: 3, 6, 7, 8, then a fresh lap
  expect(planOrder(D2, ctx(day(4))).map((x) => x.day)).toEqual([3, 6, 7, 8, 1, 2, 3]);
});
it('fixTick: a skipped or passed box is not open either', () => {
  expect(fixTick(fixed({ s: { date: day(3), day: 5, status: 'skip', savedAt: 4 } }), day(2), 'LB', 10)).toEqual({ none: 'skip' });
  // the first tick, LB (5) on d0, opens the lap: 1–4 passed
  const P = data({ cycle: { a: tick(day(0), 5, 1), b: tick(day(3), 6, 2) } });
  expect(lapOf(P).boxes[3].status).toBe('passed');
  expect(fixTick(P, day(2), 'UB', 10)).toEqual({ none: 'passed' });
});
it('fixTick: an open box whose tick would land before this lap began is left alone', () => {
  // UA d0, LA d1, then UA again on d3 starts a new lap; box 4 (UB) is open in it.
  const D = data({ cycle: { a: tick(day(0), 1, 1), b: tick(day(1), 2, 2), c: tick(day(3), 1, 3) } });
  expect(lapOf(D).boxes[3].status).toBe('open');
  expect(fixTick(D, day(2), 'UB', 10)).toEqual({ none: 'before-lap' });
});
it('fixTick: on or after the latest tick it is gymTick', () => {
  const D = fixed();
  expect(fixTick(D, day(3), 'LB', 10)).toEqual(gymTick(D, day(3), 'LB', 10));
  expect(fixTick(D, day(4), 'UA', 10)).toEqual(gymTick(D, day(4), 'UA', 10));
  expect((fixTick(D, day(4), 'UA', 10) as { newLap: boolean }).newLap).toBe(true);
  expect(fixTick(data(), day(4), 'UA', 10)).toEqual(gymTick(data(), day(4), 'UA', 10));
});
it('planOrder: a date with only later-pinned boxes left is a free day', () => {
  const D = data({ cycle: { a: tick(day(0), 1), b: tick(day(1), 2), c: tick(day(2), 3), d: tick(day(3), 4), e: tick(day(4), 5), f: tick(day(5), 6), g: tick(day(6), 7) } });
  const c = { ...ctx(day(7)), pins: { [day(9)]: 8 } };
  const o = planOrder(D, c, 4);
  expect(o.map((x) => x.day)).toEqual([0, 0, 8, 1]);
  expect(o[0].free).toEqual({ day: 8, date: day(9) });
  const p = planAhead(D, c, 4);
  expect(p[0]).toMatchObject({ cycleDay: 0, kind: 'rest', reason: 'free day: Rest is pinned to Wed 14 Jan' });
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
it('gymTick: with no ticks a session off the cycle opens a new lap', () => {
  expect(gymTick(data({ workouts: { a: workout(day(0), 'UA', []) } }), day(1), 'UB', 1)).toMatchObject({ early: [], newLap: true, doc: { day: 4 } });
});
it('gymTick: the matching session ticks the current day', () => {
  expect(gymTick(data({ cycle: { t: tick(day(0), 1) } }), day(1), 'LA', 7)).toEqual({
    id: `${day(1)}_auto_2`, doc: { date: day(1), day: 2, status: 'done', savedAt: 7 }, early: [], newLap: false,
  });
});
it('gymTick: the workout being ticked does not count as history', () => {
  // no ticks yet; D already holds today's LA workout → still day 2, not a realign
  const D = data({ workouts: { a: workout(day(0), 'UA', []), b: workout(day(1), 'LA', []) } });
  expect(gymTick(D, day(1), 'LA', 1)).toMatchObject({ early: [], newLap: false, doc: { day: 2 } });
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
it('gymTick: early returns the passed open boxes', () => {
  const D = data({ cycle: { a: tick(day(0), 1), b: tick(day(1), 2) } });
  expect(gymTick(D, day(2), 'UB', 1)).toMatchObject({ doc: { day: 4 }, early: [3], newLap: false });
});
it('gymTick: a pinned session is not early', () => {
  const D = data({ cycle: { a: tick(day(0), 1), b: tick(day(1), 2) } });
  expect(gymTick(D, day(2), 'UB', 1, { [day(2)]: 4 })).toMatchObject({ doc: { day: 4 }, early: [] });
});
it('gymTick: filled box → newLap', () => {
  const D = data({ cycle: { a: tick(day(0), 1), b: tick(day(1), 2) } });
  expect(gymTick(D, day(2), 'UA', 1)).toMatchObject({ doc: { day: 1 }, newLap: true, early: [] });
});
it('gymTick: a full lap rolls over to a fresh one', () => {
  const full = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((d) => [`t${d}`, tick(day(d - 1), d)]));
  expect(gymTick(data({ cycle: full }), day(8), 'UA', 1)).toMatchObject({ doc: { day: 1 }, early: [], newLap: false });
  expect(gymTick(data({ cycle: full }), day(8), 'LA', 1)).toMatchObject({ doc: { day: 2 }, early: [1], newLap: false });
});
it('rideTick: defers on a gym day', () => {
  const D = data({ cycle: { a: tick(day(0), 1) }, rides: { r: ride(day(1), 50, 'E1') } });
  expect(rideTick(D, day(1), 9)).toBeNull();
});
it('rideTick: fills a pinned ride box', () => {
  const D = data({ cycle: { a: tick(day(0), 1) }, rides: { r: ride(day(1), 50, 'H1') } });
  expect(rideTick(D, day(1), 9, { [day(1)]: 3 })).toMatchObject({ id: `${day(1)}_auto_3`, doc: { day: 3, status: 'done' } });
});
const swapped = (rides: Record<string, RideDoc>, extra: Partial<VikingData> = {}) =>
  data({ cycle: { a: tick(day(0), 1) }, rides, ...extra });
it('endOfDay: ride-first swap fills the ride box', () => {
  const r = endOfDay(swapped({ r: ride(day(1), 50, 'E1') }), day(1), 5, { delivered: true }) as any;
  expect(r).toMatchObject({ id: `${day(1)}_auto_6`, doc: { day: 6, status: 'done', savedAt: 5 }, early: [2] });
});
it('endOfDay: hard ride takes box 3', () => {
  expect((endOfDay(swapped({ r: ride(day(1), 50, 'H1') }), day(1), 5, { delivered: true }) as any).doc.day).toBe(3);
});
it('endOfDay: waits until delivered', () => {
  expect(endOfDay(swapped({ r: ride(day(1), 50, 'E1') }), day(1), 5, { delivered: false })).toBe('wait');
});
it('endOfDay: 30 min ride on a gym day stays extra', () => {
  expect(endOfDay(swapped({ r: ride(day(1), 30, 'E1') }), day(1), 5, { delivered: true })).toBe('slid');
});
it('endOfDay: ride on a day with a workout stays extra', () => {
  const D = swapped({ r: ride(day(1), 50, 'E1') }, { workouts: { w: workout(day(1), 'LA', []) } });
  const g = gymTick(D, day(1), 'LA', 6)!;
  const D2 = { ...D, cycle: { ...D.cycle, [g.id]: g.doc } };
  expect(endOfDay(D2, day(1), 7, { delivered: true })).toBeNull();
  expect(endOfDay(D, day(1), 7, { delivered: true })).toBe('slid');
});
it('endOfDay: day off', () => {
  expect(endOfDay(data({ cycle: { a: tick(day(0), 1) } }), day(1), 5, { pins: { [day(1)]: 0 } })).toBe('off');
});
it('endOfDay: pinned rest box 8 ticks done', () => {
  const r = endOfDay(data({ cycle: { a: tick(day(0), 1) } }), day(1), 5, { pins: { [day(1)]: 8 } }) as any;
  expect(r.doc).toMatchObject({ day: 8, status: 'done' });
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
it('rides: a planned E1 after a night shift is capped at 60 min, no from', () => {
  const D = data({ cycle: { t: tick(day(42), 5) } }); // week 7: E1 is 75 min
  expect(planAhead(D, ctx(day(43)))[0].ride).toMatchObject({ code: 'E1', minutes: 75 });
  const p = planAhead(D, { ...ctx(day(43)), afterNight: new Set([day(43)]) })[0];
  expect(p.ride).toEqual({ code: 'E1', minutes: 60, reason: 'after a night shift' });
  expect(p.reason).toBe('after a night shift');
  expect(p.garmin!.name).toBe(`Viking E1 · Endurance 60 min (${garminDate(day(43))})`);
  expect((p.garmin!.dto as any).workoutSegments[0].workoutSteps[0].endConditionValue).toBe(3600);
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
