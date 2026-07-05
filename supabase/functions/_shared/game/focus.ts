// ─────────────────────────────────────────────────────────────────────────────
// INSTANT DUNGEON — the focus timer that pulls the loop into the rest of the day.
//
// "Use a key" to enter a timed dungeon for deep work, study, chores, or
// practice: pick 1–3 "mobs" (subtasks), commit to 25 / 50 / 90 minutes, and
// clear it by seeing the timer through. The System enforces the wall-clock
// server-side (completion is rejected before `ends_at`), so a run cannot be
// forged — the time has to actually pass. Daily keys scale with rank.
//
// Pure TypeScript, shared client + server (the @game alias). No Deno/Node/DOM.
// ─────────────────────────────────────────────────────────────────────────────
import { RANKS, type Rank } from './constants.ts';

/** The three dungeon depths, in minutes. */
export const FOCUS_DURATIONS = [25, 50, 90] as const;
export type FocusDuration = (typeof FOCUS_DURATIONS)[number];

/** A run targets one to three subtasks — the "mobs" to clear. */
export const MAX_MOBS = 3;

/** Base XP for clearing a run of each depth (cap-eligible, like a gym run). */
const DURATION_XP: Record<FocusDuration, number> = {
  25: 30,
  50: 65,
  90: 120,
};

/** Each mob beyond the first adds a small clear bonus. */
const MOB_BONUS_XP = 8;

export function isFocusDuration(n: unknown): n is FocusDuration {
  return typeof n === 'number' && (FOCUS_DURATIONS as readonly number[]).includes(n);
}

/** Daily Instant-Dungeon keys, scaled by rank (mirrors army capacity growth). */
export function focusKeysPerDay(rank: string): number {
  const i = Math.max(0, RANKS.indexOf(rank as Rank));
  if (i >= RANKS.indexOf('A')) return 5;
  if (i >= RANKS.indexOf('C')) return 4;
  if (i >= RANKS.indexOf('D')) return 3;
  return 2; // E-Rank
}

/** XP for clearing a run: depth base + a bonus per additional mob. */
export function focusXp(duration: FocusDuration, mobCount: number): number {
  const mobs = Math.max(1, Math.min(MAX_MOBS, mobCount));
  return DURATION_XP[duration] + (mobs - 1) * MOB_BONUS_XP;
}

/** Sanitize a mob list to 1–3 trimmed, non-empty labels (throws if none). */
export function normalizeMobs(input: unknown): string[] {
  const arr = Array.isArray(input) ? input : [];
  const mobs = arr
    .map((m) => (typeof m === 'string' ? m.trim().slice(0, 120) : ''))
    .filter((m) => m.length > 0)
    .slice(0, MAX_MOBS);
  return mobs;
}
