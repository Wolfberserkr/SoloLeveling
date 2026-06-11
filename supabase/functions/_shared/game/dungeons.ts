// ─────────────────────────────────────────────────────────────────────────────
// GYM DUNGEONS — Phase 3. The long-term physical campaign.
//
// Each dungeon is a multi-week training phase (Foundation → Master Physique).
// A gym session is one dungeon run: max one per day, costs mana, pays XP.
// Clearing enough runs unlocks the phase's Boss Fight — a concrete benchmark
// test. Defeating the boss clears the dungeon: the next phase opens and the
// Daily Training Quest baseline rises one notch (the `dungeonCycles` hook in
// training.ts). Benchmarks are self-reported; the System trusts its Player.
// ─────────────────────────────────────────────────────────────────────────────

export type BossBenchmark = { key: string; label: string };

export type DungeonPhase = {
  phase: number;
  name: string;
  description: string;
  /** Dungeon runs required before the boss appears (~8 weeks at 3/week). */
  sessionsRequired: number;
  /** Session template — guidance, alternated A/B by feel. */
  template: string[];
  boss: {
    name: string;
    benchmarks: BossBenchmark[];
  };
};

export const DUNGEON_PHASES: DungeonPhase[] = [
  {
    phase: 1,
    name: 'Foundation',
    description:
      'Learn the movements. Machines, dumbbells, bodyweight — build the base that everything else stands on.',
    sessionsRequired: 24,
    template: [
      'Goblet Squat — 3×10',
      'Dumbbell Bench Press — 3×10',
      'Lat Pulldown or Assisted Pull-up — 3×10',
      'Romanian Deadlift (light) — 3×10',
      'Dumbbell Shoulder Press — 3×10',
      'Plank — 3×45s',
    ],
    boss: {
      name: 'The Gatekeeper',
      benchmarks: [
        { key: 'pushups_20', label: '20 push-ups, unbroken' },
        { key: 'plank_60', label: '60-second plank' },
        { key: 'squats_30', label: '30 bodyweight squats, unbroken' },
        { key: 'run_2k', label: '2 km run without stopping' },
      ],
    },
  },
  {
    phase: 2,
    name: 'Iron Path',
    description:
      'The barbell lifts. Squat, bench, row, press, deadlift — linear progression, add weight every session you can.',
    sessionsRequired: 24,
    template: [
      'Back Squat — 3×5',
      'Bench Press — 3×5',
      'Barbell Row — 3×8',
      'Overhead Press — 3×5',
      'Deadlift — 1×5',
      'Hanging Knee Raise — 3×10',
    ],
    boss: {
      name: 'Iron Golem',
      benchmarks: [
        { key: 'squat_bw075', label: 'Back squat 0.75× bodyweight ×5' },
        { key: 'bench_bw05', label: 'Bench press 0.5× bodyweight ×5' },
        { key: 'deadlift_bw', label: 'Deadlift 1× bodyweight ×3' },
        { key: 'pullup_1', label: '1 strict pull-up' },
      ],
    },
  },
  {
    phase: 3,
    name: 'Warrior’s Forge',
    description:
      'Volume and conditioning. Heavier compounds, more sets, engine work — the body hardens.',
    sessionsRequired: 30,
    template: [
      'Back Squat — 4×6',
      'Bench Press — 4×6',
      'Weighted Pull-up or Pull-up — 4×6',
      'Romanian Deadlift — 3×8',
      'Overhead Press — 3×8',
      'Farmer Carry — 3×40m',
    ],
    boss: {
      name: 'Berserker Knight',
      benchmarks: [
        { key: 'squat_bw', label: 'Back squat 1× bodyweight ×5' },
        { key: 'bench_bw075', label: 'Bench press 0.75× bodyweight ×5' },
        { key: 'deadlift_bw125', label: 'Deadlift 1.25× bodyweight ×3' },
        { key: 'pullups_5', label: '5 strict pull-ups' },
        { key: 'run_5k', label: '5 km run without stopping' },
      ],
    },
  },
  {
    phase: 4,
    name: 'Elite Conditioning',
    description:
      'Strength meets engine. Intensity blocks, sprint work, weighted calisthenics — built to perform.',
    sessionsRequired: 30,
    template: [
      'Back Squat — 5×5 (heavy)',
      'Weighted Pull-up — 4×5',
      'Incline Bench Press — 4×6',
      'Power Clean or KB Swing — 5×3',
      'Sprint Intervals — 6×200m',
      'Weighted Plank — 3×60s',
    ],
    boss: {
      name: 'Demon of the Summit',
      benchmarks: [
        { key: 'squat_bw125', label: 'Back squat 1.25× bodyweight ×3' },
        { key: 'bench_bw', label: 'Bench press 1× bodyweight ×3' },
        { key: 'deadlift_bw15', label: 'Deadlift 1.5× bodyweight ×1' },
        { key: 'pullups_10', label: '10 strict pull-ups' },
        { key: 'run_5k_27', label: '5 km under 27 minutes' },
      ],
    },
  },
  {
    phase: 5,
    name: 'Master Physique',
    description:
      'The summit campaign. Peak strength, peak condition — maintain, refine, and surpass your past self.',
    sessionsRequired: 36,
    template: [
      'Back Squat — 5×3 (peak)',
      'Bench Press — 5×3 (peak)',
      'Deadlift — 3×2 (peak)',
      'Weighted Pull-up — 5×5',
      'Sprint Intervals — 8×200m',
      'Loaded Carry Medley — 3 rounds',
    ],
    boss: {
      name: 'Monarch’s Shadow',
      benchmarks: [
        { key: 'squat_bw15', label: 'Back squat 1.5× bodyweight ×1' },
        { key: 'bench_bw125', label: 'Bench press 1.25× bodyweight ×1' },
        { key: 'deadlift_bw2', label: 'Deadlift 2× bodyweight ×1' },
        { key: 'pullups_15', label: '15 strict pull-ups' },
        { key: 'run_5k_25', label: '5 km under 25 minutes' },
      ],
    },
  },
];

export const MAX_DUNGEON_PHASE = DUNGEON_PHASES.length;

/** Definition for a phase number (clamped; phase > max means campaign done). */
export function dungeonPhaseFor(phase: number): DungeonPhase {
  const idx = Math.min(Math.max(1, phase), MAX_DUNGEON_PHASE) - 1;
  return DUNGEON_PHASES[idx];
}

export function allDungeonsCleared(phase: number): boolean {
  return phase > MAX_DUNGEON_PHASE;
}

export function isBossReady(phase: number, sessionsCompleted: number): boolean {
  if (allDungeonsCleared(phase)) return false;
  return sessionsCompleted >= dungeonPhaseFor(phase).sessionsRequired;
}

/** All benchmark keys confirmed → the boss falls. */
export function bossDefeated(phase: number, confirmed: Record<string, unknown>): boolean {
  return dungeonPhaseFor(phase).boss.benchmarks.every((b) => confirmed[b.key] === true);
}
