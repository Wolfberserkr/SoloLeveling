// ─────────────────────────────────────────────────────────────────────────────
// PENALTY QUEST — "The System does not forgive. It tests."
//
// Missing a day normally zeroes the streak with no recourse. Instead, when a
// streak worth saving breaks, the System issues a one-shot **Penalty Quest**:
// the missed day's targets, harder. Clear it before midnight and the streak is
// RESTORED (not incremented); fail and the break stands. This turns the app's
// worst moment — a lost streak, the #1 churn trigger — into a comeback beat.
//
// Pure TypeScript, shared client + server (the @game alias). No Deno/Node/DOM.
// ─────────────────────────────────────────────────────────────────────────────

/** The Penalty Quest scales the missed targets up — redemption costs more. */
export const PENALTY_MULTIPLIER = 1.25;

/** Only a streak of at least this length is worth a Penalty Quest. */
export const MIN_STREAK_FOR_PENALTY = 3;

export type ExerciseTargets = {
  pushups: number;
  situps: number;
  squats: number;
  runKm: number;
};

/** Whether a broken streak should spawn a Penalty Quest (shields take priority). */
export function shouldSpawnPenalty(brokenStreak: number, shielded: boolean): boolean {
  return !shielded && brokenStreak >= MIN_STREAK_FOR_PENALTY;
}

/** The missed day's targets, scaled up by the penalty multiplier. */
export function penaltyTargets(base: ExerciseTargets): ExerciseTargets {
  return {
    pushups: Math.ceil(base.pushups * PENALTY_MULTIPLIER),
    situps: Math.ceil(base.situps * PENALTY_MULTIPLIER),
    squats: Math.ceil(base.squats * PENALTY_MULTIPLIER),
    runKm: Math.round(base.runKm * PENALTY_MULTIPLIER * 100) / 100,
  };
}

/** True once every Penalty Quest target has been met. */
export function isPenaltyComplete(progress: ExerciseTargets, targets: ExerciseTargets): boolean {
  return (
    progress.pushups >= targets.pushups &&
    progress.situps >= targets.situps &&
    progress.squats >= targets.squats &&
    progress.runKm >= targets.runKm
  );
}
