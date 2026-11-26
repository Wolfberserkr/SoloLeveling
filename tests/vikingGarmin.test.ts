import { it, expect } from 'vitest';
import { SESS, ORDER } from '../supabase/functions/_shared/viking/data.ts';
import {
  GARMIN_EX, restSeconds, buildStrengthWorkout, buildRideWorkout, dtoMinutes, garminDate, workoutName, hashOf, withMarker,
} from '../supabase/functions/_shared/viking/garmin.ts';

it('maps every plan exercise', () => { for (const sk of ORDER) for (const e of SESS[sk].ex) expect(e.k in GARMIN_EX).toBe(true); });
it('restSeconds', () => {
  expect(restSeconds('2–3 min')).toBe(150); expect(restSeconds('90 s')).toBe(90);
  expect(restSeconds('superset')).toBe(15); expect(restSeconds('60 s after pair')).toBe(60);
  expect(restSeconds('2 min')).toBe(120); expect(restSeconds('60 s')).toBe(60);
});
it('strength DTO: one [exercise, rest] group per exercise', () => {
  const t = Object.fromEntries(SESS.LA.ex.map((e) => [e.k, { kg: e.k === 'squat' ? 112.5 : null, reps: e.r[0], sets: e.s, note: '' }]));
  const groups = (buildStrengthWorkout('LA', t, 'Viking Lower A (Wed 25 Nov)', 'x') as any).workoutSegments[0].workoutSteps;
  expect(groups).toHaveLength(7);
  expect(groups[0].numberOfIterations).toBe(3);
  expect(groups[0].workoutSteps[0]).toMatchObject({ category: 'SQUAT', exerciseName: 'BARBELL_BACK_SQUAT', weightValue: 112.5, endConditionValue: 5 });
  expect(groups[1].workoutSteps[0].weightValue).toBeNull();
  expect(groups[6].workoutSteps[0].endCondition.conditionTypeKey).toBe('lap.button');
  expect(groups.map((g: any) => g.stepOrder)).toEqual([1, 4, 7, 10, 13, 16, 19]);
});
it('strength DTO: exercise and rest steps carry no.target like the library DTO', () => {
  const t = Object.fromEntries(SESS.UA.ex.map((e) => [e.k, { kg: null, reps: e.r[0], sets: e.s, note: '' }]));
  const groups = (buildStrengthWorkout('UA', t, 'n', 'd') as any).workoutSegments[0].workoutSteps;
  for (const g of groups) {
    for (const s of g.workoutSteps) expect(s.targetType).toEqual({ workoutTargetTypeId: 1, workoutTargetTypeKey: 'no.target' });
  }
});
it('strength DTO: assisted pull-up has no weight, assist in the description', () => {
  const t = Object.fromEntries(SESS.UB.ex.map((e) => [e.k, { kg: null, assistKg: e.k === 'pullup' ? -20 : null, reps: 6, sets: 3, note: '' }]));
  const step = (buildStrengthWorkout('UB', t, 'n', 'd') as any).workoutSegments[0].workoutSteps[1].workoutSteps[0];
  expect(step.weightValue).toBeNull(); expect(step.description).toContain('assist 20 kg');
});
it('ride DTO: E1 75 min is one Z2 step in bpm', () => {
  const s = (buildRideWorkout({ code: 'E1', min: [75, 75], zones: ['Z2'], detail: '' }, 7, '1', 'n', 'd') as any).workoutSegments[0].workoutSteps;
  expect(s).toHaveLength(1);
  expect(s[0]).toMatchObject({ endConditionValue: 4500, targetValueOne: 115, targetValueTwo: 135 });
});
it('H1 in phase 1 week 7: 6 climbs, 64 min', () => {
  const dto = buildRideWorkout({ code: 'H1', min: [50, 60], zones: ['Z2', 'Z4'], detail: '' }, 7, '1', 'n', 'd');
  expect((dto as any).workoutSegments[0].workoutSteps[1].numberOfIterations).toBe(6);
  expect(dtoMinutes(dto)).toBe(64); // 15 + 6 × 6.5 + 10
});
it('names, hash and marker', () => {
  expect(workoutName('Lower A', '2026-11-25')).toBe('Viking Lower A (Wed 25 Nov)');
  expect(garminDate('2026-11-25')).toBe('Wed 25 Nov');
  expect(hashOf({ a: 1, b: [2] })).toBe(hashOf({ b: [2], a: 1 }));
  expect(hashOf('x')).toMatch(/^[0-9a-f]{8}$/);
  const a = withMarker({ description: 'x', k: 1 }), b = withMarker({ description: 'y', k: 1 });
  expect(a.hash).toBe(b.hash); expect(a.dto.description).toBe(`x [viking:${a.hash}]`);
});
it('other ride codes and strength minutes', () => {
  const r = (code: any) => buildRideWorkout({ code, min: [60, 60], zones: ['Z2'], detail: '' }, 3, '2', 'n', 'd');
  expect(dtoMinutes(r('R1'))).toBe(30);
  expect(dtoMinutes(r('H2'))).toBe(60);
  expect(dtoMinutes(r('H3'))).toBe(15 + 30 + 5);
  expect(dtoMinutes(r('L1'))).toBe(120);
  expect(dtoMinutes(r('H1'))).toBe(63); // 15 + 5 × 7.5 + 10 = 62.5
  expect(dtoMinutes(buildStrengthWorkout('UA', {}, 'n', 'd'))).toBe(0);
});
