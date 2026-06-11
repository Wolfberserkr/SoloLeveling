// ─────────────────────────────────────────────────────────────────────────────
// DAILY TRAINING QUEST — the anime baseline (push-ups / sit-ups / squats / run)
// with slow, earned long-term scaling.
//
// Targets scale with LEVEL BANDS (spec example progression) plus +5 reps /
// +0.25 km per 2 levels inside a band (clamped at the next band's base), plus
// one increment per cleared dungeon cycle ("every 2 levels OR 1 dungeon
// cycle"). Failure never punishes: the next day simply runs at reduced load.
// ─────────────────────────────────────────────────────────────────────────────
import {
  TRAINING_TIERS,
  FAILURE_LOAD_MODIFIER,
  type TrainingVariant,
} from './constants.ts';

export type TrainingTargets = {
  pushups: number;
  situps: number;
  squats: number;
  runKm: number;
};

function tierIndexForLevel(level: number): number {
  let idx = 0;
  for (let i = 0; i < TRAINING_TIERS.length; i++) {
    if (level >= TRAINING_TIERS[i].entryLevel) idx = i;
  }
  return idx;
}

function roundReps(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5);
}

function roundKm(n: number): number {
  return Math.max(0.5, Math.round(n * 4) / 4); // nearest 0.25 km
}

/** Base targets before variant/load adjustments. */
export function baseTrainingTargets(level: number, dungeonCycles: number): TrainingTargets {
  const idx = tierIndexForLevel(level);
  const tier = TRAINING_TIERS[idx];
  const next = TRAINING_TIERS[idx + 1];
  const steps = Math.floor((level - tier.entryLevel) / 2);

  let reps = tier.reps + 5 * steps;
  let runKm = tier.runKm + 0.25 * steps;
  if (next) {
    reps = Math.min(reps, next.reps - 5);
    runKm = Math.min(runKm, next.runKm - 0.25);
  }

  // Each cleared dungeon cycle bumps the baseline one notch, uncapped.
  reps += 5 * dungeonCycles;
  runKm += 0.25 * dungeonCycles;

  return { pushups: reps, situps: reps, squats: reps, runKm };
}

/**
 * Today's targets: base × load modifier × variant shape.
 * `loadModifier` < 1 after an incomplete day (form over failure).
 */
export function trainingTargetsFor(
  level: number,
  dungeonCycles: number,
  loadModifier: number,
  variant: TrainingVariant,
): TrainingTargets {
  const base = baseTrainingTargets(level, dungeonCycles);
  let repsScale = loadModifier;
  let runScale = loadModifier;

  switch (variant) {
    case 'endurance': // lower reps, longer run — fatigue resistance
      repsScale *= 0.7;
      runScale *= 1.5;
      break;
    case 'strength': // higher push/squat intensity, slower tempo
      repsScale *= 1.15;
      runScale *= 0.5;
      break;
    case 'speed': // timed circuits, minimal rest — same load, time pressure
      break;
    case 'recovery': // light movement only, no XP loss
      repsScale *= 0.3;
      runScale *= 0.5;
      break;
    case 'standard':
      break;
  }

  return {
    pushups: roundReps(base.pushups * repsScale),
    situps: roundReps(base.situps * repsScale),
    squats: roundReps(base.squats * repsScale),
    runKm: roundKm(base.runKm * runScale),
  };
}

/** Load modifier for tomorrow given whether today's quest was completed. */
export function nextLoadModifier(completedToday: boolean): number {
  return completedToday ? 1.0 : FAILURE_LOAD_MODIFIER;
}

export function isTrainingComplete(
  progress: TrainingTargets,
  targets: TrainingTargets,
): boolean {
  return (
    progress.pushups >= targets.pushups &&
    progress.situps >= targets.situps &&
    progress.squats >= targets.squats &&
    progress.runKm >= targets.runKm - 1e-9
  );
}
