// ─────────────────────────────────────────────────────────────────────────────
// XP CURVE — anti-grind, 1–2 year pacing.
//
//   totalXpForLevel(L) = round(425 · (L^1.55 − 1))   (cumulative XP to REACH level L)
//
// At a sustained ~250 XP/day (repeatables capped at 300/day + amortized book
// XP) this lands on the spec's pacing targets:
//   L10 ≈ 60 days (~2 mo) · L20 ≈ 177 d (~6 mo) · L30 ≈ 332 d (~11 mo)
//   L40 ≈ 517 d (~17 mo) · L50 ≈ 728 d (~24 mo)
// ─────────────────────────────────────────────────────────────────────────────
import { XP_BASE, XP_EXP, MAX_LEVEL } from './constants.ts';

/** Cumulative XP required to reach `level`. Level 1 is the floor (0 XP). */
export function totalXpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(XP_BASE * (Math.pow(Math.min(level, MAX_LEVEL), XP_EXP) - 1));
}

/** XP needed to go from `level` to `level + 1`. */
export function xpCostOfLevel(level: number): number {
  return totalXpForLevel(level + 1) - totalXpForLevel(level);
}

/** Level reached with `xpTotal` cumulative XP. */
export function levelFromTotalXp(xpTotal: number): number {
  if (xpTotal <= 0) return 1;
  let level = 1;
  while (level < MAX_LEVEL && xpTotal >= totalXpForLevel(level + 1)) level++;
  return level;
}

/** Progress within the current level, for XP bars. */
export function levelProgress(xpTotal: number): {
  level: number;
  intoLevel: number;
  forLevel: number;
  fraction: number;
} {
  const level = levelFromTotalXp(xpTotal);
  const floor = totalXpForLevel(level);
  const forLevel = xpCostOfLevel(level);
  const intoLevel = xpTotal - floor;
  return {
    level,
    intoLevel,
    forLevel,
    fraction: forLevel > 0 ? Math.min(1, intoLevel / forLevel) : 1,
  };
}

/**
 * Apply the daily cap to a cap-eligible award.
 * `spentToday` = sum of credited cap-eligible XP already granted this local date.
 */
export function applyDailyCap(amount: number, spentToday: number, cap = 300): number {
  return Math.max(0, Math.min(amount, cap - spentToday));
}
