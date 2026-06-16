// ─────────────────────────────────────────────────────────────────────────────
// streak — PHASE 10 coaching: the streak-risk nudge.
//
// The evening reminder already pokes a player whose Daily Training Quest is
// still open. This sharpens it: when an unbroken streak genuinely hangs on
// *tonight*, the System names the number on the line instead of sending the
// generic reminder. Pure decision + copy — the cron supplies the state and
// sends the push. No IO, no Deno here.
//
// A streak is on the line tonight only when it is currently alive (the last
// completion was yesterday) and today is still unresolved. If the player holds
// a single-miss shield (Steel Will), missing today is forgiven, so there is no
// alarm to raise — they fall back to the plain reminder.
// ─────────────────────────────────────────────────────────────────────────────

export type StreakNudgeInput = {
  /** training_totals.current_streak. */
  currentStreak: number;
  /** YYYY-MM-DD of the last completed training day, or null if never. */
  lastCompletedDate: string | null;
  /** Yesterday's local date (YYYY-MM-DD) in the player's timezone. */
  yesterday: string;
  /** Whether today's training quest is already completed. */
  completedToday: boolean;
  /** Player holds a passive that forgives a single missed day (Steel Will). */
  hasShield: boolean;
};

export type StreakNudge = { title: string; body: string };

/** Below this, the plain reminder is enough — no special alarm. */
export const STREAK_NUDGE_MIN = 3;

/**
 * The streak-risk push for tonight, or null when there's nothing on the line
 * (already trained, no meaningful streak, streak not alive today, or shielded).
 */
export function streakNudge(input: StreakNudgeInput): StreakNudge | null {
  if (input.completedToday) return null;
  if (input.currentStreak < STREAK_NUDGE_MIN) return null;
  // Alive only if the last completion was yesterday: today is the make-or-break
  // day. An older date means the streak already lapsed; today means it's safe.
  if (input.lastCompletedDate !== input.yesterday) return null;
  // A single missed day is forgiven, so tonight isn't the cliff.
  if (input.hasShield) return null;

  const n = input.currentStreak;
  return {
    title: `${n}-day streak on the line.`,
    body:
      `${n} days unbroken — and today is still empty. Miss it and the count resets to zero. ` +
      `Complete your training before midnight; the streak is the spine of everything.`,
  };
}
