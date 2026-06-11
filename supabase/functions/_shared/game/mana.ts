// ─────────────────────────────────────────────────────────────────────────────
// MANA — the daily energy economy.
//
// Mana is capacity, not score. Heavy tasks consume it; rest restores it.
// Potions can never be bought — only earned through recovery behavior
// (8h+ sleep, recovery days, meditation, nature walks).
// ─────────────────────────────────────────────────────────────────────────────

/** Mana costs per the spec. Applied when the matching quest is completed. */
export const MANA_COSTS = {
  gym: 25,
  deep_work: 20,
  reading: 15, // per ~30 pages
  journaling: 10,
  strategy: 20,
  study: 15,
} as const;

/** Flat regeneration applied at every daily reset, before any sleep bonus. */
export const DAILY_REGEN = 50;

/**
 * Sleep bonus, applied once when sleep is logged for the day.
 * 8h+ sleep also earns a Mana Potion.
 */
export function sleepBonus(hours: number): { mana: number; potion: boolean } {
  if (hours >= 8) return { mana: 50, potion: true };
  if (hours >= 6) return { mana: 30, potion: false };
  return { mana: 10, potion: false };
}

/** Poor sleep triggers a Recovery-variant training day. */
export const POOR_SLEEP_HOURS = 6;
/** Low post-regen mana triggers a Recovery-variant training day. */
export const LOW_MANA_THRESHOLD = 20;
/** Accumulated fatigue (failed days) that triggers a Recovery day. */
export const FATIGUE_THRESHOLD = 3;

/** Completing a Recovery day restores mana and earns a potion. */
export const RECOVERY_DAY_MANA = 20;

/** Potions restore a random amount in this range. */
export const POTION_RESTORE_MIN = 20;
export const POTION_RESTORE_MAX = 50;

export function clampMana(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value)));
}
