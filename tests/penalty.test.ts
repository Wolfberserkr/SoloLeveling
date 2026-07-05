import { describe, expect, it } from 'vitest';
import {
  penaltyTargets,
  shouldSpawnPenalty,
  isPenaltyComplete,
  MIN_STREAK_FOR_PENALTY,
} from '@game/penalty.ts';

describe('penalty quest', () => {
  it('only spawns for streaks worth saving', () => {
    expect(shouldSpawnPenalty(MIN_STREAK_FOR_PENALTY - 1, false)).toBe(false);
    expect(shouldSpawnPenalty(MIN_STREAK_FOR_PENALTY, false)).toBe(true);
    expect(shouldSpawnPenalty(40, false)).toBe(true);
  });

  it('never spawns when a shield already saved the streak', () => {
    expect(shouldSpawnPenalty(40, true)).toBe(false);
  });

  it('scales the missed targets up and rounds reps to whole numbers', () => {
    const base = { pushups: 20, situps: 20, squats: 20, runKm: 1 };
    const t = penaltyTargets(base);
    expect(t.pushups).toBe(25);
    expect(t.situps).toBe(25);
    expect(t.squats).toBe(25);
    expect(t.runKm).toBe(1.25);
  });

  it('rounds rep counts up so the penalty is never easier', () => {
    // 30 * 1.25 = 37.5 → 38, not 37
    expect(penaltyTargets({ pushups: 30, situps: 30, squats: 30, runKm: 1.5 }).pushups).toBe(38);
  });

  it('completes only when every target is met', () => {
    const targets = { pushups: 25, situps: 25, squats: 25, runKm: 1.25 };
    expect(isPenaltyComplete({ pushups: 25, situps: 25, squats: 25, runKm: 1.25 }, targets)).toBe(true);
    expect(isPenaltyComplete({ pushups: 25, situps: 25, squats: 24, runKm: 1.25 }, targets)).toBe(false);
    expect(isPenaltyComplete({ pushups: 25, situps: 25, squats: 25, runKm: 1.0 }, targets)).toBe(false);
  });
});
