import { describe, it, expect, beforeEach } from 'vitest';
import {
  cleanDeloadWeeks, clampWeek, deloadTargetKg, formatKg, newBlockStartKg, phaseLabel, weekPhase,
} from '../src/features/reset/resetData';
import { phaseOf, recentBest, resolvedExercise, setsArray, useResetStore } from '../src/features/reset/resetStore';
import { defaultState, loadCache, type CloudLog, type ResetState } from '../src/features/reset/resetDb';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const UID = 'test-uid';
const cacheKey = `reset_state_v1_${UID}`;
const at = (week: number, deloadWeeks: number[] = []): ResetState => ({ ...defaultState(), week, deloadWeeks });
const cached = () => JSON.parse(store.get(cacheKey)!) as ResetState;

describe('weekPhase — the 6-week block calendar', () => {
  it('runs base → load → load → density → peak → deload, then a new block', () => {
    const kinds = Array.from({ length: 13 }, (_, i) => weekPhase(i + 1).kind);
    expect(kinds).toEqual([
      'base', 'load', 'load', 'density', 'peak', 'deload',
      'base', 'load', 'load', 'density', 'peak', 'deload',
      'base',
    ]);
  });

  it('hits the sanity values from the spec', () => {
    expect(weekPhase(1)).toEqual({ week: 1, block: 1, blockWeek: 1, kind: 'base', rampIn: true, manual: false, scheduled: false });
    expect(weekPhase(5)).toMatchObject({ block: 1, blockWeek: 5, kind: 'peak' });
    expect(weekPhase(6)).toMatchObject({ block: 1, blockWeek: 6, kind: 'deload', scheduled: true, manual: false });
    expect(weekPhase(7)).toMatchObject({ block: 2, blockWeek: 1, kind: 'base', rampIn: false });
    // D's week right now.
    expect(weekPhase(12)).toMatchObject({ block: 2, blockWeek: 6, kind: 'deload', scheduled: true });
    expect(weekPhase(13)).toMatchObject({ block: 3, blockWeek: 1, kind: 'base', rampIn: false });
  });

  it('a manual deload ends the block early and shifts the next scheduled deload', () => {
    const dw = [9];
    expect(weekPhase(9, dw)).toMatchObject({ block: 2, blockWeek: 3, kind: 'deload', manual: true, scheduled: false });
    expect(weekPhase(10, dw)).toMatchObject({ block: 3, blockWeek: 1, kind: 'base' });
    expect(weekPhase(12, dw)).toMatchObject({ block: 3, blockWeek: 3, kind: 'load' });
    expect(weekPhase(15, dw)).toMatchObject({ block: 3, blockWeek: 6, kind: 'deload', scheduled: true, manual: false });
    expect(weekPhase(16, dw)).toMatchObject({ block: 4, blockWeek: 1 });
    // Weeks before the manual deload are not affected.
    for (let w = 1; w < 9; w++) expect(weekPhase(w, dw)).toEqual(weekPhase(w));
  });

  it('a manual deload on a block\'s 6th week changes nothing', () => {
    for (let w = 1; w <= 20; w++) {
      expect(weekPhase(w, [6, 12])).toEqual(weekPhase(w));
    }
  });

  it('back-to-back manual deloads each count as a one-week block', () => {
    expect(weekPhase(3, [2, 3])).toMatchObject({ block: 2, blockWeek: 1, kind: 'deload', manual: true });
    expect(weekPhase(4, [2, 3])).toMatchObject({ block: 3, blockWeek: 1, kind: 'base' });
  });

  it('labels the phase in plain words', () => {
    expect(phaseLabel(weekPhase(12))).toBe('Block 2 · Deload week');
    expect(phaseLabel(weekPhase(13))).toBe('Block 3 · Week 1 of 6 · Base');
    expect(phaseLabel(weekPhase(1))).toBe('Block 1 · Week 1 of 6 · Ramp-in');
    expect(phaseLabel(weekPhase(9, [9]))).toBe('Block 2 · Deload week');
  });

  it('never crashes on garbage weeks or deload lists', () => {
    expect(weekPhase(NaN).week).toBe(1);
    expect(weekPhase(0).week).toBe(1);
    expect(weekPhase(-4).week).toBe(1);
    expect(weekPhase(2.5).week).toBe(2);
    expect(weekPhase(1e9).week).toBe(99);
    expect(clampWeek('12')).toBe(12);
    expect(clampWeek(undefined)).toBe(1);
    expect(weekPhase(9, 'oops' as unknown as number[])).toEqual(weekPhase(9));
    expect(weekPhase(9, null as unknown as number[])).toEqual(weekPhase(9));
    expect(cleanDeloadWeeks([9, '9', 9.5, null, -1, 0, 200, 9, 3, {}])).toEqual([3, 9]);
    expect(cleanDeloadWeeks({ 0: 9 })).toEqual([]);
  });
});

describe('load targets', () => {
  it('rounds the deload aim to 2.5 kg, never below one step', () => {
    expect(deloadTargetKg(40)).toBe(25);      // 26 → 25
    expect(deloadTargetKg(50)).toBe(32.5);    // 32.5
    expect(deloadTargetKg(45)).toBe(30);      // 29.25 → 30
    expect(deloadTargetKg(2)).toBe(2.5);      // 1.3 rounds to 0; one step instead
    expect(deloadTargetKg(null)).toBeNull();
    expect(deloadTargetKg(0)).toBeNull();
  });

  it('starts a new block ~5% heavier, at least one 2.5 kg step up', () => {
    expect(newBlockStartKg(40)).toBe(42.5);   // 42 → 42.5
    expect(newBlockStartKg(41)).toBe(42.5);
    expect(newBlockStartKg(10)).toBe(12.5);   // 5% rounds away; the step wins
    expect(newBlockStartKg(100)).toBe(105);
    expect(newBlockStartKg(null)).toBeNull();
  });

  it('formats weights the way she types them', () => {
    expect(formatKg(42.5)).toBe('42.5');
    expect(formatKg(25)).toBe('25');
    expect(formatKg(0.1 + 0.2)).toBe('0.3');
  });
});

describe('recentBest — the base the targets come from', () => {
  const now = new Date('2026-11-24T10:00:00');
  const daysAgo = (n: number) => new Date(+now - n * 86400000).toISOString();
  const log = (exercise_id: string, weight: number, logged_at: string): CloudLog => ({ exercise_id, reps: '10', weight, logged_at });

  it('takes the max over the last 56 days, so light deload weights never lower it', () => {
    const s = { ...defaultState(), cloudLogs: [
      log('leg-press', 40, daysAgo(10)), log('leg-press', 26, daysAgo(3)), log('leg-press', 37.5, daysAgo(20)),
    ] };
    expect(recentBest(s, 'leg-press', now)).toBe(40);
  });

  it('ignores logs older than 56 days, from today, other exercises, and junk weights', () => {
    const s = { ...defaultState(), cloudLogs: [
      log('leg-press', 80, daysAgo(57)),
      log('leg-press', 60, now.toISOString()),         // typed today: must not move today's target
      log('hack-squat', 70, daysAgo(5)),
      log('leg-press', 0, daysAgo(5)),
      log('leg-press', NaN, daysAgo(5)),
      log('leg-press', -5, daysAgo(5)),
      log('leg-press', 35, 'not a date'),
      log('leg-press', 30, daysAgo(56)),
    ] };
    expect(recentBest(s, 'leg-press', now)).toBe(30);
    expect(recentBest({ ...defaultState(), cloudLogs: [log('leg-press', 80, daysAgo(57))] }, 'leg-press', now)).toBeNull();
  });

  it('does not read the undated, slot-keyed draft log', () => {
    const s = { ...defaultState(), log: { 'leg-press': { reps: '12', weight: '90' } } };
    expect(recentBest(s, 'leg-press', now)).toBeNull();
  });

  it('follows a swap: the base is the swapped-in exercise\'s own history', () => {
    const s: ResetState = {
      ...at(12),
      swaps: { 'lower-a': { 'leg-press': 'hack-squat' } },
      cloudLogs: [log('leg-press', 100, daysAgo(4)), log('hack-squat', 50, daysAgo(4))],
    };
    const current = resolvedExercise(s, 'lower-a', 'leg-press');
    expect(current.id).toBe('hack-squat');
    expect(recentBest(s, current.id, now)).toBe(50);
  });
});

describe('the deload switch in the store', () => {
  beforeEach(() => {
    store.clear();
    useResetStore.setState({ uid: UID, ready: true, s: at(9) });
  });

  it('switches the current week to a deload and back, persisting the list', () => {
    useResetStore.getState().toggleDeload();
    let s = useResetStore.getState().s;
    expect(s.deloadWeeks).toEqual([9]);
    expect(phaseOf(s)).toMatchObject({ kind: 'deload', manual: true });
    expect(cached().deloadWeeks).toEqual([9]);

    useResetStore.getState().toggleDeload();
    s = useResetStore.getState().s;
    expect(s.deloadWeeks).toEqual([]);
    expect(phaseOf(s)).toMatchObject({ kind: 'load', blockWeek: 3 });
    expect(cached().deloadWeeks).toEqual([]);
  });

  it('re-sizes a day in progress and restores it, keeping ticks that fit', () => {
    const { toggleSet } = useResetStore.getState();
    [0, 1, 2].forEach((i) => toggleSet('lower-a', 'leg-press', i));
    useResetStore.getState().toggleDeload();
    expect(useResetStore.getState().s.progress['lower-a']['leg-press']).toEqual([true, true]);
    expect(cached().progress['lower-a']['leg-press']).toEqual([true, true]);
    useResetStore.getState().toggleDeload();
    // Off again: the full week is back; the dropped third tick is not invented.
    expect(useResetStore.getState().s.progress['lower-a']['leg-press']).toEqual([true, true, false, false]);
  });

  it('refuses to switch off a scheduled deload, even one also in the list', () => {
    useResetStore.setState({ uid: UID, ready: true, s: at(12, [12]) });
    useResetStore.getState().toggleDeload();
    const s = useResetStore.getState().s;
    expect(s.deloadWeeks).toEqual([12]);
    expect(phaseOf(s)).toMatchObject({ kind: 'deload', scheduled: true });
    expect(store.has(cacheKey)).toBe(false); // nothing was written
  });

  it('pressing + after a manual deload starts a new block', () => {
    useResetStore.getState().toggleDeload();
    useResetStore.getState().bumpWeek(1);
    const s = useResetStore.getState().s;
    expect(s.week).toBe(10);
    expect(phaseOf(s)).toMatchObject({ block: 3, blockWeek: 1, kind: 'base' });
    expect(resolvedExercise(s, 'lower-a', 'leg-press').sets).toBe(4);
  });

  it('cleans a garbage list before toggling', () => {
    useResetStore.setState({ uid: UID, ready: true, s: { ...at(9), deloadWeeks: 'x' as unknown as number[] } });
    useResetStore.getState().toggleDeload();
    expect(useResetStore.getState().s.deloadWeeks).toEqual([9]);
  });

  it('keeps counting past week 12, up to 99', () => {
    useResetStore.setState({ uid: UID, ready: true, s: at(12) });
    useResetStore.getState().bumpWeek(1);
    expect(useResetStore.getState().s.week).toBe(13);
    useResetStore.setState({ uid: UID, ready: true, s: at(99) });
    useResetStore.getState().bumpWeek(1);
    expect(useResetStore.getState().s.week).toBe(99);
    useResetStore.setState({ uid: UID, ready: true, s: at(1) });
    useResetStore.getState().bumpWeek(-1);
    expect(useResetStore.getState().s.week).toBe(1);
  });
});

describe('the cache', () => {
  beforeEach(() => store.clear());

  it('defaults the list for a cache from before the deload cycle', () => {
    const { deloadWeeks: _drop, ...old } = at(7);
    store.set(cacheKey, JSON.stringify(old));
    expect(loadCache(UID).deloadWeeks).toEqual([]);
    expect(loadCache(UID).week).toBe(7);
  });

  it('cleans a corrupt list and an out-of-range week', () => {
    store.set(cacheKey, JSON.stringify({ ...at(500), deloadWeeks: [9, 'x', 9, 2.5] }));
    const s = loadCache(UID);
    expect(s.deloadWeeks).toEqual([9]);
    expect(s.week).toBe(99);
    store.set(cacheKey, JSON.stringify({ ...at(3), deloadWeeks: { a: 1 } }));
    expect(loadCache(UID).deloadWeeks).toEqual([]);
  });

  it('boxes the day view renders match the stored arrays after a toggle', () => {
    useResetStore.setState({ uid: UID, ready: true, s: at(9) });
    useResetStore.getState().toggleSet('upper-a', 'chest-press', 0);
    useResetStore.getState().toggleDeload();
    const s = useResetStore.getState().s;
    const e = resolvedExercise(s, 'upper-a', 'chest-press');
    expect(setsArray(s.progress['upper-a']['chest-press'], e.sets)).toEqual(s.progress['upper-a']['chest-press']);
  });
});
