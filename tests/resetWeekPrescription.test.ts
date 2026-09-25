import { describe, it, expect, beforeEach } from 'vitest';
import { PLAN, exerciseById, weekNote, weekPrescription } from '../src/features/reset/resetData';
import { dayCount, resolvedExercise, sessionTally, useResetStore } from '../src/features/reset/resetStore';
import { defaultState, type ResetState } from '../src/features/reset/resetDb';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const legPress = exerciseById('leg-press')!;       // 4 × 12–15
const legCurl = exerciseById('leg-curl-seated')!;  // 3 × 12–15, superset
const squat = exerciseById('back-squat-mon')!;     // 4 × 6–8, ramp
const stairs = exerciseById('stair-intervals')!;   // 5 × 40 sec, conditioning
const allEx = PLAN.flatMap((d) => d.ex);
const at = (week: number): ResetState => ({ ...defaultState(), week });

describe('week prescription — sets and reps follow the program week', () => {
  it('weeks 2–4 run exactly as written', () => {
    for (const w of [2, 3, 4]) for (const e of allEx) expect(weekPrescription(e, w)).toBe(e);
  });

  it('week 5 deload: 2 sets, same reps, on every exercise', () => {
    for (const e of allEx) {
      const d = weekPrescription(e, 5);
      expect(d.sets, e.id).toBe(Math.min(e.sets, 2));
      expect(d.reps, e.id).toBe(e.reps);
    }
    expect(weekPrescription(legPress, 5)).toMatchObject({ sets: 2, reps: '12–15 reps' });
    // The squat keeps its ramp: ramp + one working set.
    expect(weekPrescription(squat, 5)).toMatchObject({ sets: 2, reps: '6–8 reps', ramp: true });
  });

  it('week 1 ramp-in: half the sets rounded up, same reps', () => {
    expect(weekPrescription(legPress, 1)).toMatchObject({ sets: 2, reps: '12–15 reps' });
    expect(weekPrescription(legCurl, 1)).toMatchObject({ sets: 2, reps: '12–15 reps' });
    for (const e of allEx) expect(weekPrescription(e, 1).sets).toBeGreaterThanOrEqual(1);
  });

  it('week 6+ supersets rest 45 sec; straight sets keep their rest', () => {
    expect(weekPrescription(legCurl, 6).rest).toBe(45);
    expect(weekPrescription(legPress, 6)).toBe(legPress);
  });

  it('weeks 7–8 intervals: 6 rounds of 40 sec with 30 sec easy', () => {
    expect(weekPrescription(stairs, 7)).toMatchObject({ sets: 6, reps: '40 sec', rest: 30 });
    expect(weekPrescription(stairs, 6)).toBe(stairs);
  });

  it('explains the change on the card, and stays quiet when nothing changed', () => {
    expect(weekNote(legPress, 5)).toMatch(/Deload week — same weight, same reps: 2 of 4 sets/);
    expect(weekNote(legPress, 1)).toMatch(/Week 1 ramp-in.*2 of 4 sets/);
    expect(weekNote(stairs, 7)).toMatch(/6 rounds of 40 sec hard \/ 30 sec easy/);
    expect(weekNote(legPress, 3)).toBeNull();
  });
});

describe('the day follows the week automatically', () => {
  beforeEach(() => {
    store.clear();
    useResetStore.setState({ uid: 'u', ready: true, s: at(4) });
  });

  it('a deload-week day asks for 2 sets per exercise in the boxes, ring and log', () => {
    const s = at(5);
    expect(resolvedExercise(s, 'lower-a', 'leg-press').sets).toBe(2);
    const day = PLAN.find((d) => d.id === 'lower-a')!;
    expect(dayCount(s, 'lower-a').total).toBe(day.ex.reduce((a, e) => a + Math.min(e.sets, 2), 0));
    const t = sessionTally(s, 'lower-a');
    expect(t.exercises.find((e) => e.slot_id === 'leg-press')).toMatchObject({ sets_total: 2, prescribe: '12–15 reps' });
  });

  it('a swapped exercise is deloaded too', () => {
    const s = { ...at(5), swaps: { 'lower-a': { 'leg-press': 'hack-squat' } } };
    expect(resolvedExercise(s, 'lower-a', 'leg-press')).toMatchObject({ id: 'hack-squat', sets: 2 });
  });

  it('stepping into the deload re-sizes a day in progress, keeping ticks that fit', () => {
    const st = useResetStore.getState();
    [0, 1, 2].forEach((i) => st.toggleSet('lower-a', 'leg-press', i));
    useResetStore.getState().bumpWeek(1); // 4 → 5
    const s = useResetStore.getState().s;
    expect(s.progress['lower-a']['leg-press']).toEqual([true, true]);
    expect(dayCount(s, 'lower-a').done).toBe(2);
    useResetStore.getState().bumpWeek(1); // 5 → 6: back to full sets, nothing invented
    expect(useResetStore.getState().s.progress['lower-a']['leg-press']).toEqual([true, true, false, false]);
  });
});
