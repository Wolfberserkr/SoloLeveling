// ─────────────────────────────────────────────────────────────────────────────
// FUEL PROTOCOL — daily nutrition intake (Phase 11).
//
// The body is built in the kitchen as much as the gym. Each day the Player
// logs protein as it is eaten and checks off the supplement stack; hitting
// the protein target pays XP once per day (repeatable → cap-eligible), and a
// complete stack pays a small bonus on top. Targets are personal: stored on
// the profile, defaulting to a fat-loss cut for a heavy Player and editable
// within honest bounds.
// ─────────────────────────────────────────────────────────────────────────────

// XP economy (both repeatable → cap-eligible)
export const NUTRITION_XP = 30; // protein target met
export const SUPPLEMENT_STACK_XP = 10; // full supplement stack taken

/** Default daily protein target (g). Matches a ~1.6 g/kg cut for the
 * founding Player's 116.5 kg scan — see suggestedProteinTarget. */
export const DEFAULT_PROTEIN_TARGET_G = 182;

/** Honest bounds for a player-set target — outside these is a typo. */
export const PROTEIN_TARGET_MIN_G = 60;
export const PROTEIN_TARGET_MAX_G = 400;

/** Single log entry cap (a whole roast chicken is ~180 g of protein). */
export const MAX_PROTEIN_PER_LOG_G = 300;
/** Daily accumulation cap — beyond this the counter is meaningless. */
export const MAX_PROTEIN_PER_DAY_G = 999;

// Calories — the ceiling side of the cut. Informational only: no XP rides on
// eating less, that is the wrong incentive to gamify.
export const DEFAULT_CALORIE_TARGET_KCAL = 2200;
export const CALORIE_TARGET_MIN_KCAL = 1200;
export const CALORIE_TARGET_MAX_KCAL = 6000;
export const MAX_KCAL_PER_LOG = 3000;
export const MAX_KCAL_PER_DAY = 20000;

/** The daily supplement stack shown in the Fuel panel. */
export const SUPPLEMENT_STACK = [
  { key: 'creatine', name: 'Creatine Monohydrate', dose: '5 g, any time' },
  { key: 'vitamins', name: 'Micros — Vitamin D3 + Omega-3', dose: 'with a meal' },
] as const;

export type SupplementKey = (typeof SUPPLEMENT_STACK)[number]['key'];

/**
 * Suggested daily protein target from a body scan.
 * Uses g-per-kg bodyweight scaled by body-fat: lean players need more per kg
 * of total weight than heavy ones (where lean mass is the smaller fraction).
 * ~1.6 g/kg above 30% BF, ~1.8 g/kg between 20–30%, ~2.0 g/kg below 20% —
 * squarely inside the evidence-based 1.6–2.2 g/kg band for a cut.
 */
export function suggestedProteinTarget(weightKg: number, bodyFatPct?: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return DEFAULT_PROTEIN_TARGET_G;
  const bf = Number.isFinite(bodyFatPct) ? Number(bodyFatPct) : 25;
  const perKg = bf > 30 ? 1.6 : bf > 20 ? 1.8 : 2.0;
  return clampProteinTarget(Math.round(weightKg * perKg));
}

/** Clamp a player-entered target into the honest band. */
export function clampProteinTarget(target: number): number {
  if (!Number.isFinite(target)) return DEFAULT_PROTEIN_TARGET_G;
  return Math.max(PROTEIN_TARGET_MIN_G, Math.min(PROTEIN_TARGET_MAX_G, Math.round(target)));
}

/** Add a logged portion to the day's running total, clamped to sane bounds. */
export function accumulateProtein(currentG: number, incrementG: number): number {
  const current = Number.isFinite(currentG) ? Math.max(0, currentG) : 0;
  const inc = Number.isFinite(incrementG)
    ? Math.max(0, Math.min(incrementG, MAX_PROTEIN_PER_LOG_G))
    : 0;
  return Math.min(MAX_PROTEIN_PER_DAY_G, Math.round((current + inc) * 10) / 10);
}

/** Clamp a player-entered calorie ceiling into the honest band. */
export function clampCalorieTarget(target: number): number {
  if (!Number.isFinite(target)) return DEFAULT_CALORIE_TARGET_KCAL;
  return Math.max(
    CALORIE_TARGET_MIN_KCAL,
    Math.min(CALORIE_TARGET_MAX_KCAL, Math.round(target)),
  );
}

/** Add a logged portion to the day's running calorie total. */
export function accumulateCalories(currentKcal: number, incrementKcal: number): number {
  const current = Number.isFinite(currentKcal) ? Math.max(0, currentKcal) : 0;
  const inc = Number.isFinite(incrementKcal)
    ? Math.max(0, Math.min(incrementKcal, MAX_KCAL_PER_LOG))
    : 0;
  return Math.min(MAX_KCAL_PER_DAY, Math.round(current + inc));
}

/** True once the day's protein total reaches the target. */
export function proteinTargetMet(totalG: number, targetG: number): boolean {
  return totalG >= targetG - 1e-9;
}

/** True when every supplement in the stack has been taken. */
export function stackComplete(creatine: boolean, vitamins: boolean): boolean {
  return creatine && vitamins;
}
