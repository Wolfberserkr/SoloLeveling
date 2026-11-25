import { describe, expect, it } from 'vitest';
import { EXBY, ORDER, SESS, STEP } from '../supabase/functions/_shared/viking/data.ts';
import { dn, emptyData, iso, viking, type SetEntry, type VikingData, type WorkoutDoc } from '../supabase/functions/_shared/viking/logic.ts';
import { nextTargets, progressFor, resetKg } from '../supabase/functions/_shared/viking/targets.ts';

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

describe('viking targets', () => {
const S = (kg: number, reps: number, est?: SetEntry['est']) => ({ kg, reps, ...(est ? { est } : {}) });
const sq = EXBY.squat, cr = EXBY.crunch;
it('targets: hit the top on every set → +1 step, reps to the bottom', () => {
  expect(progressFor(sq, [{ date: day(0), sets: [S(110, 8), S(110, 8), S(110, 8)] }], undefined, 3)).toMatchObject({ kg: 115, reps: 5 });
});
it('targets: not there → same kg, lowest recorded reps + 1 (kept within the range)', () => {
  expect(progressFor(sq, [{ date: day(0), sets: [S(110, 6), S(110, 5)] }], undefined, 3)).toMatchObject({ kg: 110, reps: 6 });
  expect(progressFor(EXBY.rdl, [{ date: day(0), sets: [S(120, 5), S(110, 10)] }], undefined, 3)).toMatchObject({ kg: 120, reps: 8 });
});
it('targets: fewer sets than planned never bumps', () => {
  expect(progressFor(sq, [{ date: day(0), planned: 3, sets: [S(110, 8)] }], undefined, 3)).toMatchObject({ kg: 110, reps: 8 });
});
it('targets: estimated reps hold the target', () => {
  const h = [{ date: day(0), sets: [S(110, 5, ['reps']), S(110, 5, ['reps']), S(110, 5, ['reps'])] }];
  expect(progressFor(sq, h, undefined, 3)).toMatchObject({ kg: 110, reps: 5, repsUnknown: true });
  const h8 = [{ date: day(0), sets: [S(110, 8, ['reps']), S(110, 8, ['reps']), S(110, 8, ['reps'])] }];
  expect(progressFor(sq, h8, undefined, 3).kg).toBe(110); // assumed 8s never bump
});
it('targets: kg 0 / est kg is unknown, not a weight', () => {
  expect(progressFor(cr, [{ date: day(0), sets: [S(0, 15, ['kg'])] }], undefined, 3)).toMatchObject({ kg: null, reps: 10 });
  expect(progressFor(cr, [{ date: day(0), sets: [S(0, 15)] }], undefined, 3).kg).toBeNull();
  expect(progressFor(cr, [{ date: day(0), sets: [S(20, 12)] }, { date: day(8), sets: [S(0, 15, ['kg'])] }], undefined, 3).kg).toBe(20);
});
it('targets: bodyweight climbs reps, never kg; assisted keeps the assist off the watch', () => {
  expect(progressFor(EXBY.hkr, [{ date: day(0), sets: [S(82, 12)] }], undefined, 3)).toMatchObject({ kg: null, reps: 13 });
  const pu = progressFor(EXBY.pullup, [{ date: day(0), sets: [S(-20, 10), S(-20, 10), S(-20, 10)] }], undefined, 3);
  expect(pu).toMatchObject({ kg: null, assistKg: -17.5, reps: 6 });
});
it('targets: reset override, then the stall baseline restarts', () => {
  expect(resetKg(110, 'bbL')).toBe(95);
  const at = (d: number) => `${day(d)}T10:00:00Z`;
  const old = [0, 8, 16, 24].map((d) => ({ date: day(d), startedAt: at(d), sets: [S(110, 5)] }));
  expect(progressFor(sq, old, undefined, 3).stalled).toBe(true);
  expect(progressFor(sq, old, undefined, 3, 95).kg).toBe(95);
  const after = [...old, ...[32, 40, 48, 56, 64].map((d) => ({ date: day(d), startedAt: at(d), sets: [S(95, 8), S(95, 8), S(95, 8)] }))];
  const p = progressFor(sq, after, at(30), 3);
  expect(p).toMatchObject({ stalled: false, kg: 100 });
});
it('targets: bounded', () => {
  for (const sk of ORDER) for (const e of SESS[sk].ex) for (const kg of [0, 1, 50]) {
    const p = progressFor(e, [{ date: day(0), sets: [S(kg, e.r[1])] }], undefined, 3);
    if (p.kg !== null) { expect(p.kg).toBeGreaterThan(0); expect(p.kg).toBeLessThanOrEqual(kg + STEP[e.inc]); }
    if (e.inc === 'bw' || e.inc === 'pull') expect(p.kg).toBeNull();
  }
});
it('nextTargets: deload halves sets (rounded up), same kg', () => {
  const v = viking(data({ workouts: { a: workout(day(0), 'LA', [{ ex: 'squat', sets: [S(110, 5)] }]) } }));
  expect(nextTargets(v, 'LA', day(35), {}, {}).squat).toMatchObject({ sets: 2, kg: 110 });
});
it('targets: pull-ups at kg 0 progress by reps, never ignored', () => {
  const pu = EXBY.pullup;
  expect(progressFor(pu, [{ date: day(0), sets: [S(0, 6)] }], undefined, 3)).toMatchObject({ kg: null, assistKg: null, reps: 7 });
  // assist -2.5 hit -> unassisted (assistKg null), then bodyweight reps climb
  const a = progressFor(pu, [{ date: day(0), sets: [S(-2.5, 10), S(-2.5, 10), S(-2.5, 10)] }], undefined, 3);
  expect(a).toMatchObject({ kg: null, assistKg: null, reps: 6 });
  expect(a.note).not.toMatch(/0 kg/);
  const b = progressFor(pu, [{ date: day(0), sets: [S(-2.5, 10), S(-2.5, 10), S(-2.5, 10)] }, { date: day(8), sets: [S(0, 8)] }], undefined, 3);
  expect(b).toMatchObject({ kg: null, assistKg: null, reps: 9 });
  expect(progressFor(pu, [{ date: day(0), sets: [S(0, 10)] }], undefined, 3)).toMatchObject({ reps: 10, note: 'Top of range: slow the tempo' });
  // cap at 0: never positive
  expect(progressFor(pu, [{ date: day(0), sets: [S(-1, 10), S(-1, 10), S(-1, 10)] }], undefined, 3).assistKg ?? 0).toBeLessThanOrEqual(0);
});
});
