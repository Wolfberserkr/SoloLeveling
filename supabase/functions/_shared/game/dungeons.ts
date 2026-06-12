// ─────────────────────────────────────────────────────────────────────────────
// GYM DUNGEONS — Phase 3. The long-term physical campaign.
//
// Each dungeon is a multi-week training phase (Foundation → Master Physique).
// A gym session is one dungeon run: max one per day, costs mana, pays XP.
// Runs follow a 4-day Upper/Lower split (Upper A → Lower A → Upper B →
// Lower B), cycled by run count — miss a day and the cycle waits, a session
// is never skipped. Clearing enough runs unlocks the phase's Boss Fight — a
// concrete benchmark test. Defeating the boss clears the dungeon: the next
// phase opens and the Daily Training Quest baseline rises one notch (the
// `dungeonCycles` hook in training.ts). Benchmarks are self-reported; the
// System trusts its Player.
// ─────────────────────────────────────────────────────────────────────────────

export type BossBenchmark = { key: string; label: string };

export type DungeonExercise = {
  name: string;
  /** Sets × reps guidance, e.g. '3×10'. */
  scheme: string;
  /** Demo search override; defaults to `${name} form` (see demoSearchUrl). */
  demo?: string;
};

export type SessionKind = 'upper_a' | 'lower_a' | 'upper_b' | 'lower_b';

export const SESSION_ORDER: SessionKind[] = ['upper_a', 'lower_a', 'upper_b', 'lower_b'];

export const SESSION_LABELS: Record<SessionKind, { title: string; focus: string }> = {
  upper_a: { title: 'Upper A — Strength Awakening', focus: 'Heavy press + horizontal pull' },
  lower_a: { title: 'Lower A — Pillar of Vitality', focus: 'Squat focus' },
  upper_b: { title: 'Upper B — Heaven-Touch', focus: 'Vertical press + vertical pull' },
  lower_b: { title: 'Lower B — Earth-Splitter', focus: 'Hinge + posterior chain' },
};

/** Which session the cycle suggests next — runs cycle A→B→C→D, never skip. */
export function sessionKindFor(sessionsCompleted: number): SessionKind {
  return SESSION_ORDER[((sessionsCompleted % 4) + 4) % 4];
}

export function isSessionKind(value: unknown): value is SessionKind {
  return typeof value === 'string' && (SESSION_ORDER as string[]).includes(value);
}

export function splitFor(kind: SessionKind): 'upper' | 'lower' {
  return kind === 'upper_a' || kind === 'upper_b' ? 'upper' : 'lower';
}

/** YouTube search for an exercise demonstration — robust against link rot. */
export function demoSearchUrl(exercise: DungeonExercise): string {
  const query = exercise.demo ?? `${exercise.name} form`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

// Warmups and cooldowns are shared across phases — only the main work scales.
export const WARMUPS: Record<'upper' | 'lower', DungeonExercise[]> = {
  upper: [
    { name: 'Rowing machine — easy pace', scheme: '5 min', demo: 'rowing machine technique' },
    { name: 'Band Pull-Aparts', scheme: '2×15' },
    { name: 'Scapular Push-ups', scheme: '2×10' },
    { name: 'Band Shoulder Dislocates', scheme: '2×10' },
  ],
  lower: [
    { name: 'Stationary bike — easy', scheme: '5 min', demo: 'stationary bike warm up' },
    { name: 'Glute Bridges', scheme: '2×12' },
    { name: 'Bodyweight Squats', scheme: '2×12' },
    { name: 'Leg Swings', scheme: '2×10 each' },
  ],
};

export const COOLDOWNS: Record<'upper' | 'lower', DungeonExercise[]> = {
  upper: [
    { name: 'Doorway Pec Stretch', scheme: '2×30s each' },
    { name: 'Lat Hang', scheme: '2×30s', demo: 'dead hang lat stretch' },
    { name: 'Child’s Pose', scheme: '1×90s', demo: 'childs pose stretch' },
  ],
  lower: [
    { name: 'Couch Stretch', scheme: '2×45s each', demo: 'couch stretch hip flexor' },
    { name: 'Seated Hamstring Stretch', scheme: '1×60s each' },
    { name: 'Pigeon Pose', scheme: '1×45s each', demo: 'pigeon pose stretch' },
  ],
};

export type DungeonPhase = {
  phase: number;
  name: string;
  description: string;
  /** Dungeon runs required before the boss appears (~6-9 weeks at 4/week). */
  sessionsRequired: number;
  /** Main work per session of the weekly cycle; warmup/cooldown are shared. */
  sessions: Record<SessionKind, DungeonExercise[]>;
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
    sessions: {
      upper_a: [
        { name: 'Dumbbell Bench Press', scheme: '3×10' },
        { name: 'Seated Cable Row', scheme: '3×10' },
        { name: 'Incline Dumbbell Press', scheme: '3×10' },
        { name: 'Lat Pulldown', scheme: '3×10', demo: 'lat pulldown form beginner' },
        { name: 'Tricep Rope Pushdown', scheme: '2×12' },
        { name: 'Dumbbell Curl', scheme: '2×12' },
      ],
      lower_a: [
        { name: 'Goblet Squat', scheme: '3×10' },
        { name: 'Leg Press', scheme: '3×10' },
        { name: 'Romanian Deadlift (light)', scheme: '3×10', demo: 'romanian deadlift form beginner' },
        { name: 'Lying Leg Curl', scheme: '3×12' },
        { name: 'Standing Calf Raise', scheme: '3×15' },
        { name: 'Plank', scheme: '3×45s' },
      ],
      upper_b: [
        { name: 'Dumbbell Shoulder Press', scheme: '3×10' },
        { name: 'Lat Pulldown or Assisted Pull-up', scheme: '3×10', demo: 'assisted pull up machine form' },
        { name: 'Dumbbell Flat Press', scheme: '3×10', demo: 'dumbbell bench press form' },
        { name: 'Face Pulls', scheme: '3×15' },
        { name: 'Dumbbell Lateral Raise', scheme: '3×12' },
        { name: 'Hanging Knee Raise', scheme: '3×10' },
      ],
      lower_b: [
        { name: 'Hip Thrust', scheme: '3×10', demo: 'barbell hip thrust form' },
        { name: 'Bulgarian Split Squat', scheme: '3×8 each' },
        { name: 'Walking Lunge', scheme: '3×10 each' },
        { name: 'Back Extension', scheme: '3×12' },
        { name: 'Seated Calf Raise', scheme: '3×15' },
        { name: 'Side Plank', scheme: '3×30s each' },
      ],
    },
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
    sessions: {
      upper_a: [
        { name: 'Bench Press', scheme: '3×5', demo: 'barbell bench press tutorial beginner' },
        { name: 'Barbell Row', scheme: '3×8', demo: 'barbell bent over row form' },
        { name: 'Incline Dumbbell Press', scheme: '3×8' },
        { name: 'Lat Pulldown', scheme: '3×10' },
        { name: 'Tricep Rope Pushdown', scheme: '2×12' },
        { name: 'Dumbbell Curl', scheme: '2×12' },
      ],
      lower_a: [
        { name: 'Back Squat', scheme: '3×5', demo: 'barbell back squat tutorial beginner' },
        { name: 'Romanian Deadlift', scheme: '3×8' },
        { name: 'Leg Press', scheme: '3×10' },
        { name: 'Lying Leg Curl', scheme: '3×10' },
        { name: 'Standing Calf Raise', scheme: '3×12' },
        { name: 'Plank', scheme: '3×60s' },
      ],
      upper_b: [
        { name: 'Overhead Press', scheme: '3×5', demo: 'barbell overhead press tutorial' },
        { name: 'Pull-up or Assisted Pull-up', scheme: '3×6', demo: 'assisted pullup progression beginner' },
        { name: 'Dumbbell Flat Press', scheme: '3×8', demo: 'dumbbell bench press form' },
        { name: 'Seated Cable Row', scheme: '3×10' },
        { name: 'Dumbbell Lateral Raise', scheme: '3×12' },
        { name: 'Face Pulls', scheme: '2×15' },
      ],
      lower_b: [
        { name: 'Deadlift', scheme: '1×5', demo: 'conventional deadlift tutorial beginner' },
        { name: 'Front Squat or Goblet Squat', scheme: '3×8', demo: 'front squat form beginner' },
        { name: 'Bulgarian Split Squat', scheme: '3×8 each' },
        { name: 'Barbell Hip Thrust', scheme: '3×10' },
        { name: 'Hanging Knee Raise', scheme: '3×10' },
        { name: 'Seated Calf Raise', scheme: '3×12' },
      ],
    },
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
    sessions: {
      upper_a: [
        { name: 'Bench Press', scheme: '4×6', demo: 'barbell bench press form' },
        { name: 'Barbell Row', scheme: '4×6', demo: 'barbell bent over row form' },
        { name: 'Weighted Dip or Machine Dip', scheme: '3×8', demo: 'weighted dip form' },
        { name: 'Lat Pulldown', scheme: '3×10' },
        { name: 'Overhead Tricep Extension', scheme: '3×10' },
        { name: 'Hammer Curl', scheme: '3×10' },
      ],
      lower_a: [
        { name: 'Back Squat', scheme: '4×6' },
        { name: 'Romanian Deadlift', scheme: '3×8' },
        { name: 'Walking Lunge', scheme: '3×10 each' },
        { name: 'Lying Leg Curl', scheme: '3×12' },
        { name: 'Standing Calf Raise', scheme: '4×12' },
        { name: 'Weighted Plank', scheme: '3×45s' },
      ],
      upper_b: [
        { name: 'Overhead Press', scheme: '3×8', demo: 'barbell overhead press form' },
        { name: 'Weighted Pull-up or Pull-up', scheme: '4×6', demo: 'weighted pull up form' },
        { name: 'Incline Bench Press', scheme: '3×8' },
        { name: 'Chest-Supported Row', scheme: '3×10' },
        { name: 'Dumbbell Lateral Raise', scheme: '4×12' },
        { name: 'Face Pulls', scheme: '3×15' },
      ],
      lower_b: [
        { name: 'Deadlift', scheme: '3×5', demo: 'conventional deadlift form' },
        { name: 'Front Squat', scheme: '3×6' },
        { name: 'Barbell Hip Thrust', scheme: '3×8' },
        { name: 'Back Extension', scheme: '3×12' },
        { name: 'Farmer Carry', scheme: '3×40m' },
        { name: 'Hanging Leg Raise', scheme: '3×10' },
      ],
    },
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
    sessions: {
      upper_a: [
        { name: 'Bench Press', scheme: '5×5 (heavy)', demo: 'barbell bench press form' },
        { name: 'Weighted Pull-up', scheme: '4×5', demo: 'weighted pull up form' },
        { name: 'Incline Dumbbell Press', scheme: '4×8' },
        { name: 'Pendlay Row', scheme: '4×6' },
        { name: 'Weighted Dip', scheme: '3×8' },
        { name: 'Face Pulls', scheme: '3×15' },
      ],
      lower_a: [
        { name: 'Back Squat', scheme: '5×5 (heavy)' },
        { name: 'Romanian Deadlift', scheme: '4×8' },
        { name: 'Bulgarian Split Squat', scheme: '3×8 each' },
        { name: 'Nordic Curl or Leg Curl', scheme: '3×8', demo: 'nordic hamstring curl progression' },
        { name: 'Sprint Intervals', scheme: '6×200m', demo: 'how to run 200m sprint intervals' },
        { name: 'Weighted Plank', scheme: '3×60s' },
      ],
      upper_b: [
        { name: 'Overhead Press', scheme: '5×5', demo: 'barbell overhead press form' },
        { name: 'Weighted Chin-up', scheme: '4×5' },
        { name: 'Close-Grip Bench Press', scheme: '4×8' },
        { name: 'Chest-Supported Row', scheme: '4×10' },
        { name: 'Dumbbell Lateral Raise', scheme: '4×15' },
        { name: 'Hanging Leg Raise', scheme: '3×12' },
      ],
      lower_b: [
        { name: 'Power Clean or KB Swing', scheme: '5×3', demo: 'power clean technique' },
        { name: 'Deadlift', scheme: '4×4', demo: 'conventional deadlift form' },
        { name: 'Front Squat', scheme: '4×6' },
        { name: 'Barbell Hip Thrust', scheme: '4×8' },
        { name: 'Sled Push or Hill Sprints', scheme: '6 rounds', demo: 'sled push technique' },
        { name: 'Farmer Carry', scheme: '3×40m' },
      ],
    },
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
    sessions: {
      upper_a: [
        { name: 'Bench Press', scheme: '5×3 (peak)', demo: 'barbell bench press form' },
        { name: 'Weighted Pull-up', scheme: '5×5', demo: 'weighted pull up form' },
        { name: 'Incline Bench Press', scheme: '4×6' },
        { name: 'Pendlay Row', scheme: '4×6' },
        { name: 'Weighted Dip', scheme: '4×8' },
        { name: 'Face Pulls', scheme: '3×15' },
      ],
      lower_a: [
        { name: 'Back Squat', scheme: '5×3 (peak)' },
        { name: 'Romanian Deadlift', scheme: '4×6' },
        { name: 'Walking Lunge (loaded)', scheme: '3×10 each', demo: 'dumbbell walking lunge form' },
        { name: 'Nordic Curl', scheme: '3×8', demo: 'nordic hamstring curl progression' },
        { name: 'Sprint Intervals', scheme: '8×200m', demo: 'how to run 200m sprint intervals' },
        { name: 'Weighted Plank', scheme: '3×60s' },
      ],
      upper_b: [
        { name: 'Overhead Press', scheme: '5×3 (peak)', demo: 'barbell overhead press form' },
        { name: 'Weighted Chin-up', scheme: '5×5' },
        { name: 'Close-Grip Bench Press', scheme: '4×6' },
        { name: 'Chest-Supported Row', scheme: '4×8' },
        { name: 'Dumbbell Lateral Raise', scheme: '4×12' },
        { name: 'Hanging Leg Raise', scheme: '4×10' },
      ],
      lower_b: [
        { name: 'Deadlift', scheme: '3×2 (peak)', demo: 'conventional deadlift form' },
        { name: 'Power Clean', scheme: '5×3', demo: 'power clean technique' },
        { name: 'Front Squat', scheme: '4×5' },
        { name: 'Barbell Hip Thrust', scheme: '4×6' },
        { name: 'Loaded Carry Medley', scheme: '3 rounds', demo: 'loaded carry variations' },
        { name: 'Sled Push', scheme: '6 rounds', demo: 'sled push technique' },
      ],
    },
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
