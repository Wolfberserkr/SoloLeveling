// The training program — 4-day Upper/Lower for a beginner, gym-equipped, 45-60 min.
// Re-themed as "Dungeons" the Hunter must clear each week.

export type Exercise = {
  key: string;
  name: string;
  sets: number;
  reps: string; // e.g. "5", "8-10"
  restSec: number;
  videoQuery: string; // used to build a youtube.com/results search URL
  isMain?: boolean; // tracked for personal records & charting
  note?: string;
};

export type Session = {
  key: string; // unique key e.g. "upper_a"
  day: number; // 1..7 in the weekly cycle
  title: string; // anime-flavoured
  subtitle: string; // plain description
  difficulty: string; // E-Rank Gate, D-Rank Gate, etc
  warmup: Exercise[];
  main: Exercise[];
  cooldown: Exercise[];
};

const ytSearch = (q: string) => q;

export const PROGRAM: Session[] = [
  {
    key: 'upper_a',
    day: 1,
    title: 'GATE: UPPER A — "Strength Awakening"',
    subtitle: 'Heavy press + horizontal pull focus.',
    difficulty: 'E-Rank Gate',
    warmup: [
      { key: 'wu_row', name: 'Rowing machine — easy pace', sets: 1, reps: '5 min', restSec: 0, videoQuery: ytSearch('rowing machine warmup form') },
      { key: 'wu_band_pull', name: 'Band pull-aparts', sets: 2, reps: '15', restSec: 30, videoQuery: ytSearch('band pull apart form') },
      { key: 'wu_scap_pushup', name: 'Scapular push-ups', sets: 2, reps: '10', restSec: 30, videoQuery: ytSearch('scapular pushup tutorial') },
    ],
    main: [
      { key: 'bench_press', name: 'Barbell Bench Press', sets: 3, reps: '5', restSec: 180, videoQuery: ytSearch('barbell bench press tutorial beginner'), isMain: true, note: 'Add 2.5 kg / 5 lb next session if all sets x5.' },
      { key: 'bent_row', name: 'Barbell Bent-Over Row', sets: 3, reps: '6-8', restSec: 150, videoQuery: ytSearch('barbell bent over row form'), isMain: true },
      { key: 'db_incline_press', name: 'Dumbbell Incline Press', sets: 3, reps: '8-10', restSec: 120, videoQuery: ytSearch('dumbbell incline press form') },
      { key: 'lat_pulldown', name: 'Lat Pulldown', sets: 3, reps: '8-10', restSec: 120, videoQuery: ytSearch('lat pulldown form beginner') },
      { key: 'tricep_pushdown', name: 'Tricep Rope Pushdown', sets: 2, reps: '10-12', restSec: 90, videoQuery: ytSearch('tricep rope pushdown form') },
      { key: 'db_curl', name: 'Dumbbell Bicep Curl', sets: 2, reps: '10-12', restSec: 90, videoQuery: ytSearch('dumbbell bicep curl form') },
    ],
    cooldown: [
      { key: 'cd_door_stretch', name: 'Doorway Pec Stretch', sets: 2, reps: '30 sec each side', restSec: 0, videoQuery: ytSearch('doorway pec stretch') },
      { key: 'cd_child_pose', name: "Child's Pose", sets: 1, reps: '90 sec', restSec: 0, videoQuery: ytSearch('childs pose stretch') },
    ],
  },
  {
    key: 'lower_a',
    day: 2,
    title: 'GATE: LOWER A — "Pillar of Vitality"',
    subtitle: 'Squat-focused lower session.',
    difficulty: 'E-Rank Gate',
    warmup: [
      { key: 'wu_bike', name: 'Stationary bike — easy', sets: 1, reps: '5 min', restSec: 0, videoQuery: ytSearch('stationary bike warmup') },
      { key: 'wu_glute_bridge', name: 'Glute Bridges', sets: 2, reps: '12', restSec: 30, videoQuery: ytSearch('bodyweight glute bridge') },
      { key: 'wu_air_squat', name: 'Bodyweight Squats', sets: 2, reps: '12', restSec: 30, videoQuery: ytSearch('bodyweight squat warmup') },
    ],
    main: [
      { key: 'back_squat', name: 'Barbell Back Squat', sets: 3, reps: '5', restSec: 180, videoQuery: ytSearch('barbell back squat tutorial beginner'), isMain: true, note: 'Linear progression: +2.5 kg / 5 lb when all sets cleared.' },
      { key: 'rdl', name: 'Romanian Deadlift', sets: 3, reps: '8', restSec: 150, videoQuery: ytSearch('romanian deadlift form'), isMain: true },
      { key: 'leg_press', name: 'Leg Press', sets: 3, reps: '10-12', restSec: 120, videoQuery: ytSearch('leg press form') },
      { key: 'leg_curl', name: 'Lying Leg Curl', sets: 3, reps: '10-12', restSec: 90, videoQuery: ytSearch('lying leg curl form') },
      { key: 'calf_raise', name: 'Standing Calf Raise', sets: 3, reps: '12-15', restSec: 60, videoQuery: ytSearch('standing calf raise machine') },
      { key: 'plank', name: 'Front Plank', sets: 2, reps: '45 sec', restSec: 60, videoQuery: ytSearch('front plank form') },
    ],
    cooldown: [
      { key: 'cd_hip_flexor', name: 'Couch Stretch', sets: 2, reps: '45 sec each side', restSec: 0, videoQuery: ytSearch('couch stretch hip flexor') },
      { key: 'cd_ham_stretch', name: 'Seated Hamstring Stretch', sets: 1, reps: '60 sec each side', restSec: 0, videoQuery: ytSearch('seated hamstring stretch') },
    ],
  },
  {
    key: 'upper_b',
    day: 4,
    title: 'GATE: UPPER B — "Heaven-Touch"',
    subtitle: 'Vertical press + vertical pull focus.',
    difficulty: 'E-Rank Gate',
    warmup: [
      { key: 'wu_jump_rope', name: 'Jump Rope', sets: 1, reps: '3 min', restSec: 0, videoQuery: ytSearch('jump rope warmup beginner') },
      { key: 'wu_shoulder_dislocate', name: 'Band Shoulder Dislocates', sets: 2, reps: '10', restSec: 30, videoQuery: ytSearch('band shoulder dislocates') },
      { key: 'wu_inchworm', name: 'Inchworms', sets: 2, reps: '6', restSec: 30, videoQuery: ytSearch('inchworm warmup') },
    ],
    main: [
      { key: 'overhead_press', name: 'Barbell Overhead Press', sets: 3, reps: '5', restSec: 180, videoQuery: ytSearch('barbell overhead press tutorial'), isMain: true, note: 'Bar should travel straight up over mid-foot.' },
      { key: 'pullup', name: 'Pull-Up / Assisted Pull-Up', sets: 3, reps: '5-8', restSec: 150, videoQuery: ytSearch('assisted pullup progression beginner'), isMain: true },
      { key: 'db_bench', name: 'Dumbbell Flat Press', sets: 3, reps: '8-10', restSec: 120, videoQuery: ytSearch('dumbbell flat bench press') },
      { key: 'seated_row', name: 'Seated Cable Row', sets: 3, reps: '8-10', restSec: 120, videoQuery: ytSearch('seated cable row form') },
      { key: 'lat_raise', name: 'Dumbbell Lateral Raise', sets: 3, reps: '12-15', restSec: 60, videoQuery: ytSearch('dumbbell lateral raise form') },
      { key: 'face_pull', name: 'Face Pulls', sets: 2, reps: '12-15', restSec: 60, videoQuery: ytSearch('face pulls form') },
    ],
    cooldown: [
      { key: 'cd_lat_stretch', name: 'Lat Hang / Stretch', sets: 2, reps: '30 sec', restSec: 0, videoQuery: ytSearch('lat stretch hang') },
      { key: 'cd_thread', name: 'Thread-the-Needle', sets: 1, reps: '45 sec each side', restSec: 0, videoQuery: ytSearch('thread the needle stretch') },
    ],
  },
  {
    key: 'lower_b',
    day: 5,
    title: 'GATE: LOWER B — "Earth-Splitter"',
    subtitle: 'Deadlift-focused posterior chain session.',
    difficulty: 'E-Rank Gate',
    warmup: [
      { key: 'wu_row2', name: 'Rowing machine — easy', sets: 1, reps: '5 min', restSec: 0, videoQuery: ytSearch('rowing machine warmup') },
      { key: 'wu_kb_swing', name: 'Light Kettlebell Swings', sets: 2, reps: '10', restSec: 45, videoQuery: ytSearch('kettlebell swing form') },
      { key: 'wu_walking_lunge', name: 'Walking Lunges (bodyweight)', sets: 2, reps: '10', restSec: 30, videoQuery: ytSearch('walking lunge form') },
    ],
    main: [
      { key: 'deadlift', name: 'Conventional Deadlift', sets: 1, reps: '5', restSec: 240, videoQuery: ytSearch('conventional deadlift tutorial beginner'), isMain: true, note: 'One heavy top-set. Add 2.5-5 kg per session.' },
      { key: 'front_squat', name: 'Front Squat (or Goblet Squat)', sets: 3, reps: '6-8', restSec: 150, videoQuery: ytSearch('front squat form beginner'), isMain: true },
      { key: 'bulgarian_split', name: 'Bulgarian Split Squat', sets: 3, reps: '8 each leg', restSec: 90, videoQuery: ytSearch('bulgarian split squat form') },
      { key: 'hip_thrust', name: 'Barbell Hip Thrust', sets: 3, reps: '10', restSec: 120, videoQuery: ytSearch('barbell hip thrust form') },
      { key: 'seated_calf', name: 'Seated Calf Raise', sets: 3, reps: '12-15', restSec: 60, videoQuery: ytSearch('seated calf raise form') },
      { key: 'hanging_leg', name: 'Hanging Knee Raise', sets: 3, reps: '8-12', restSec: 60, videoQuery: ytSearch('hanging knee raise form') },
    ],
    cooldown: [
      { key: 'cd_pigeon', name: 'Pigeon Pose', sets: 2, reps: '45 sec each side', restSec: 0, videoQuery: ytSearch('pigeon pose stretch') },
      { key: 'cd_cat_cow', name: 'Cat-Cow', sets: 1, reps: '10 reps', restSec: 0, videoQuery: ytSearch('cat cow stretch') },
    ],
  },
];

export const MAIN_LIFTS = [
  { key: 'bench_press', name: 'Bench Press' },
  { key: 'back_squat', name: 'Back Squat' },
  { key: 'deadlift', name: 'Deadlift' },
  { key: 'overhead_press', name: 'Overhead Press' },
  { key: 'bent_row', name: 'Bent-Over Row' },
];

export const DELOAD_EVERY_WEEKS = 5;

export function sessionFor(key: string): Session | undefined {
  return PROGRAM.find((s) => s.key === key);
}

export function isDeloadWeek(weekNumber: number): boolean {
  return weekNumber > 0 && weekNumber % DELOAD_EVERY_WEEKS === 0;
}

export function weekNumberSince(start: Date, now: Date = new Date()): number {
  const ms = now.getTime() - start.getTime();
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000)) + 1;
}

export function ytURL(q: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}
