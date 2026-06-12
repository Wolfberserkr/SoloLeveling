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

export type DungeonExercise = {
  name: string;
  /** Sets × reps guidance, e.g. '3×10'. */
  scheme: string;
  /** Demo search override; defaults to `${name} form` (see demoSearchUrl). */
  demo?: string;
};

export type DungeonPhase = {
  phase: number;
  name: string;
  description: string;
  /** Dungeon runs required before the boss appears (~8 weeks at 3/week). */
  sessionsRequired: number;
  /** Session template — guidance, alternated A/B by feel. */
  template: DungeonExercise[];
  boss: {
    name: string;
    benchmarks: BossBenchmark[];
  };
};

/** YouTube search for an exercise demonstration — robust against link rot. */
export function demoSearchUrl(exercise: DungeonExercise): string {
  const query = exercise.demo ?? `${exercise.name} form`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export const DUNGEON_PHASES: DungeonPhase[] = [
  {
    phase: 1,
    name: 'Foundation',
    description:
      'Learn the movements. Machines, dumbbells, bodyweight — build the base that everything else stands on.',
    sessionsRequired: 24,
    template: [
      { name: 'Goblet Squat', scheme: '3×10' },
      { name: 'Dumbbell Bench Press', scheme: '3×10' },
      { name: 'Lat Pulldown or Assisted Pull-up', scheme: '3×10', demo: 'lat pulldown form beginner' },
      { name: 'Romanian Deadlift (light)', scheme: '3×10', demo: 'romanian deadlift form beginner' },
      { name: 'Dumbbell Shoulder Press', scheme: '3×10' },
      { name: 'Plank', scheme: '3×45s' },
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
      { name: 'Back Squat', scheme: '3×5', demo: 'barbell back squat tutorial beginner' },
      { name: 'Bench Press', scheme: '3×5', demo: 'barbell bench press tutorial beginner' },
      { name: 'Barbell Row', scheme: '3×8', demo: 'barbell bent over row form' },
      { name: 'Overhead Press', scheme: '3×5', demo: 'barbell overhead press tutorial' },
      { name: 'Deadlift', scheme: '1×5', demo: 'conventional deadlift tutorial beginner' },
      { name: 'Hanging Knee Raise', scheme: '3×10' },
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
      { name: 'Back Squat', scheme: '4×6' },
      { name: 'Bench Press', scheme: '4×6', demo: 'barbell bench press form' },
      { name: 'Weighted Pull-up or Pull-up', scheme: '4×6', demo: 'weighted pull up form' },
      { name: 'Romanian Deadlift', scheme: '3×8' },
      { name: 'Overhead Press', scheme: '3×8', demo: 'barbell overhead press form' },
      { name: 'Farmer Carry', scheme: '3×40m' },
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
      { name: 'Back Squat', scheme: '5×5 (heavy)' },
      { name: 'Weighted Pull-up', scheme: '4×5' },
      { name: 'Incline Bench Press', scheme: '4×6' },
      { name: 'Power Clean or KB Swing', scheme: '5×3', demo: 'power clean technique' },
      { name: 'Sprint Intervals', scheme: '6×200m', demo: 'how to run 200m sprint intervals' },
      { name: 'Weighted Plank', scheme: '3×60s' },
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
      { name: 'Back Squat', scheme: '5×3 (peak)' },
      { name: 'Bench Press', scheme: '5×3 (peak)', demo: 'barbell bench press form' },
      { name: 'Deadlift', scheme: '3×2 (peak)', demo: 'conventional deadlift form' },
      { name: 'Weighted Pull-up', scheme: '5×5' },
      { name: 'Sprint Intervals', scheme: '8×200m', demo: 'how to run 200m sprint intervals' },
      { name: 'Loaded Carry Medley', scheme: '3 rounds', demo: 'loaded carry variations' },
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
