import { describe, it, expect } from 'vitest';
import {
  compareLegacy,
  legacyReward,
  LEGACY_CLEAR_XP,
  LEGACY_HORIZON_DAYS,
  type LegacyMetrics,
} from '@game/legacy.ts';

const PAST: LegacyMetrics = {
  level: 10,
  totalStats: 120,
  benchKg: 60,
  squatKg: 80,
  deadliftKg: 100,
  totalReps: 5000,
  totalRunKm: 50,
  bestStreak: 20,
  booksFinished: 3,
};

/** Past plus a uniform delta on every dimension. */
function improvedBy(delta: number): LegacyMetrics {
  return Object.fromEntries(
    Object.entries(PAST).map(([k, v]) => [k, v + delta]),
  ) as unknown as LegacyMetrics;
}

describe('Legacy Boss comparison', () => {
  it('declares victory when every core dimension improves', () => {
    const v = compareLegacy(PAST, improvedBy(1));
    expect(v.victory).toBe(true);
    expect(v.coreBeaten).toBe(v.coreRequired);
  });

  it('fails if a single core dimension stagnates', () => {
    const current = { ...improvedBy(1), squatKg: PAST.squatKg }; // squat held flat
    const v = compareLegacy(PAST, current);
    expect(v.victory).toBe(false);
    expect(v.coreBeaten).toBe(v.coreRequired - 1);
  });

  it('fails if a core dimension regresses', () => {
    const current = { ...improvedBy(1), level: PAST.level - 1 };
    expect(compareLegacy(PAST, current).victory).toBe(false);
  });

  it('does not require lifts the past self never logged', () => {
    const pastNoLifts: LegacyMetrics = { ...PAST, benchKg: 0, squatKg: 0, deadliftKg: 0 };
    // Improve only level + attributes; lifts still zero and not comparable.
    const current: LegacyMetrics = { ...pastNoLifts, level: 11, totalStats: 130 };
    const v = compareLegacy(pastNoLifts, current);
    expect(v.victory).toBe(true);
    expect(v.coreRequired).toBe(2); // only level + totalStats are comparable
    expect(v.dimensions.find((d) => d.key === 'benchKg')!.comparable).toBe(false);
  });

  it('counts bonus dimensions separately from core', () => {
    const current = { ...improvedBy(1) };
    const v = compareLegacy(PAST, current);
    expect(v.bonusBeaten).toBe(4); // totalReps, totalRunKm, bestStreak, booksFinished
  });

  it('flags every dimension as not-improved when nothing changes', () => {
    const v = compareLegacy(PAST, { ...PAST });
    expect(v.victory).toBe(false);
    expect(v.dimensions.every((d) => !d.improved)).toBe(true);
  });
});

describe('Legacy Boss rewards', () => {
  it('pays the base XP and scales essence by bonus dimensions beaten', () => {
    const v = compareLegacy(PAST, improvedBy(1));
    const r = legacyReward(v);
    expect(r.xp).toBe(LEGACY_CLEAR_XP);
    expect(r.essence).toBe(100 + v.bonusBeaten * 25);
  });

  it('uses the 90-day horizon from spec', () => {
    expect(LEGACY_HORIZON_DAYS).toBe(90);
  });
});
