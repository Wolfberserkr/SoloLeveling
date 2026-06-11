import { describe, it, expect } from 'vitest';
import {
  baseTrainingTargets,
  trainingTargetsFor,
  nextLoadModifier,
  isTrainingComplete,
} from '@game/training.ts';

describe('training quest scaling', () => {
  it('starts at the anime baseline: 20/20/20/1km', () => {
    const t = baseTrainingTargets(1, 0);
    expect(t).toEqual({ pushups: 20, situps: 20, squats: 20, runKm: 1.0 });
  });

  // Spec bands: L4-7 → 30/1.5km, L8-12 → 40/2km, L13-18 → 60/3km,
  // L19-25 → 80/4km, L26+ → 100/5km
  it.each([
    [4, 30, 1.5],
    [8, 40, 2.0],
    [13, 60, 3.0],
    [19, 80, 4.0],
    [26, 100, 5.0],
  ])('level %i lands on band base %i reps / %f km', (level, reps, km) => {
    const t = baseTrainingTargets(level, 0);
    expect(t.pushups).toBe(reps);
    expect(t.runKm).toBeCloseTo(km);
  });

  it('scales +5 reps / +0.25 km per 2 levels within a band', () => {
    expect(baseTrainingTargets(10, 0).pushups).toBe(45); // C band entry 8 → +1 step
    expect(baseTrainingTargets(10, 0).runKm).toBeCloseTo(2.25);
  });

  it('clamps below the next band base (no skipping jumps)', () => {
    expect(baseTrainingTargets(12, 0).pushups).toBeLessThan(60);
    expect(baseTrainingTargets(7, 0).pushups).toBeLessThan(40);
  });

  it('keeps scaling past S-rank entry (no cap at the top)', () => {
    expect(baseTrainingTargets(40, 0).pushups).toBeGreaterThan(100);
  });

  it('bumps one notch per cleared dungeon cycle', () => {
    const base = baseTrainingTargets(5, 0);
    const cycled = baseTrainingTargets(5, 2);
    expect(cycled.pushups).toBe(base.pushups + 10);
    expect(cycled.runKm).toBeCloseTo(base.runKm + 0.5);
  });

  it('reduces load after a failed day (form over failure)', () => {
    expect(nextLoadModifier(true)).toBe(1.0);
    expect(nextLoadModifier(false)).toBe(0.85);
    const reduced = trainingTargetsFor(1, 0, 0.85, 'standard');
    expect(reduced.pushups).toBeLessThanOrEqual(20);
  });

  it('shapes variants: endurance trades reps for distance', () => {
    const std = trainingTargetsFor(10, 0, 1, 'standard');
    const end = trainingTargetsFor(10, 0, 1, 'endurance');
    expect(end.pushups).toBeLessThan(std.pushups);
    expect(end.runKm).toBeGreaterThan(std.runKm);
  });

  it('recovery mode is light movement only', () => {
    const rec = trainingTargetsFor(10, 0, 1, 'recovery');
    expect(rec.pushups).toBeLessThanOrEqual(15);
    expect(rec.runKm).toBeLessThanOrEqual(1.25);
  });

  it('validates completion against all four targets', () => {
    const targets = { pushups: 20, situps: 20, squats: 20, runKm: 1 };
    expect(isTrainingComplete({ ...targets }, targets)).toBe(true);
    expect(isTrainingComplete({ ...targets, runKm: 0.9 }, targets)).toBe(false);
  });
});
