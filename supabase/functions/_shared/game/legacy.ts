// ─────────────────────────────────────────────────────────────────────────────
// LEGACY BOSS (Phase 8) — your past self.
//
// Every 90 days the System snapshots the Player's measurable capability. When a
// snapshot comes due it is reanimated as a boss: you must SURPASS your past self
// to clear it. Victory requires improving every *comparable core* dimension
// (level, total attributes, and each big lift that had a record at snapshot
// time). Secondary dimensions are bonus — they sweeten the reward, they do not
// gate the win. Coasting lets your past self stand; that is the point.
//
// Pure TypeScript, shared client + server. Numbers in, verdict out — the edge
// function captures the metrics from the DB and persists the outcome.
// ─────────────────────────────────────────────────────────────────────────────

/** Days between a snapshot being taken and the past self rising to fight. */
export const LEGACY_HORIZON_DAYS = 90;

/** Cap-exempt XP for surpassing your past self (one-shot, like a boss clear). */
export const LEGACY_CLEAR_XP = 300;

/** The measurable self, captured at a point in time. All numbers, 0 = absent. */
export type LegacyMetrics = {
  level: number;
  totalStats: number; // sum of the nine attributes
  benchKg: number; // best logged bench / squat / deadlift top set
  squatKg: number;
  deadliftKg: number;
  totalReps: number; // lifetime push-ups + sit-ups + squats
  totalRunKm: number;
  bestStreak: number;
  booksFinished: number;
};

export type LegacyDimension = {
  key: keyof LegacyMetrics;
  label: string;
  core: boolean;
  unit?: string;
};

/** The big three lifts are only required when a past record exists to beat. */
const LIFT_DIMENSIONS: Array<keyof LegacyMetrics> = ['benchKg', 'squatKg', 'deadliftKg'];

export const LEGACY_DIMENSIONS: LegacyDimension[] = [
  // Core — must be surpassed to win (lifts only when a past record exists).
  { key: 'level', label: 'Level', core: true },
  { key: 'totalStats', label: 'Total Attributes', core: true },
  { key: 'benchKg', label: 'Best Bench', core: true, unit: 'kg' },
  { key: 'squatKg', label: 'Best Squat', core: true, unit: 'kg' },
  { key: 'deadliftKg', label: 'Best Deadlift', core: true, unit: 'kg' },
  // Bonus — extra reward, never required.
  { key: 'totalReps', label: 'Lifetime Reps', core: false },
  { key: 'totalRunKm', label: 'Distance Run', core: false, unit: 'km' },
  { key: 'bestStreak', label: 'Best Streak', core: false },
  { key: 'booksFinished', label: 'Tomes Cleared', core: false },
];

export type DimensionResult = LegacyDimension & {
  past: number;
  current: number;
  comparable: boolean; // a past value existed to measure against
  improved: boolean; // current strictly greater than past
};

export type LegacyVerdict = {
  dimensions: DimensionResult[];
  victory: boolean;
  coreRequired: number; // comparable core dimensions
  coreBeaten: number;
  bonusBeaten: number;
};

/** Compare a past snapshot against the present self. */
export function compareLegacy(past: LegacyMetrics, current: LegacyMetrics): LegacyVerdict {
  const dimensions: DimensionResult[] = LEGACY_DIMENSIONS.map((d) => {
    const p = past[d.key] ?? 0;
    const c = current[d.key] ?? 0;
    // A lift is only a fair fight if the past self had a record on the board.
    const comparable = LIFT_DIMENSIONS.includes(d.key) ? p > 0 : true;
    return { ...d, past: p, current: c, comparable, improved: comparable && c > p };
  });

  const coreDims = dimensions.filter((d) => d.core && d.comparable);
  return {
    dimensions,
    victory: coreDims.length > 0 && coreDims.every((d) => d.improved),
    coreRequired: coreDims.length,
    coreBeaten: coreDims.filter((d) => d.improved).length,
    bonusBeaten: dimensions.filter((d) => !d.core && d.improved).length,
  };
}

/** Rewards for a cleared Legacy Boss — bonus dimensions raise the Essence payout. */
export function legacyReward(verdict: LegacyVerdict): { xp: number; essence: number } {
  return { xp: LEGACY_CLEAR_XP, essence: 100 + verdict.bonusBeaten * 25 };
}
