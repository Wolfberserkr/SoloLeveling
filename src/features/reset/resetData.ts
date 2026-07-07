// The "Reset" 4-day home-training program — ported verbatim from the DWorkout
// app's data.js. Plan, warmups, cooldowns, week tips, injury flags, swap
// suggestions, and finish messages. Pure data; no DOM.

export type Exercise = {
  id: string;
  name: string;
  sets: number;
  reps: string;
  load: string;
  video: string;
};

export type DayKind = 'strength' | 'mobility' | 'rest';
export type Day = {
  id: string;
  name: string;
  focus: string;
  ex: Exercise[];
  dow?: string;
  kind?: DayKind;
};

// Lymphatic-drainage flow shown before the strength sessions (replaces the old
// warm-up checklist). Rendered as an embedded video in DayView.
export const LYMPH_VIDEO = 'https://youtu.be/hFteQ6JXoN0?si=U_flnlnERvn9dGHN';

export const COOLDOWN = [
  'Standing forward fold — 30 sec · hold and breathe',
  'Pigeon stretch — 45 sec each side',
  'Doorway chest stretch + overhead triceps reach — 30 sec each',
  "Child's pose — 1 min, slow breaths to lower heart rate",
];

// Mobility & shadow-jump-rope days (Wed / Sat). A light conditioning + mobility
// flow — refine freely. Add a demo video per day via the slot in DayView.
export const MOBILITY = [
  'Shadow jump rope — 5 rounds of 45 sec, easy bounce, rest 20 sec between',
  '20 ankle circles each side · 20 hip circles each direction',
  'Cat–cow — 10 slow reps · thoracic rotations — 8 each side',
  "World's greatest stretch — 4 each side",
  '90/90 hip switches — 10 total · deep squat hold — 45 sec',
  'Finish with 5 slow diaphragmatic breaths',
];

// Full rest day (Sun). Optional light recovery — nothing to log.
export const REST_TIPS = [
  'Gentle 20–30 min walk if you feel like moving',
  'Light stretching or foam rolling for anything tight',
  'Hydrate well and aim for an early night',
  'Let the body absorb the week — rest is where the progress lands',
];

// Equipment: one 5 kg plate AND one 10 kg plate — only one is used at a time.
// Ordered as a Mon–Sun week: strength Mon/Tue/Thu/Fri, mobility Wed/Sat, rest Sun.
export const PLAN: Day[] = [
  { id: 'lower-a', name: 'Lower A', focus: 'Quads & glutes', dow: 'Monday', kind: 'strength', ex: [
    { id: 'goblet-squat',  name: 'Goblet Squat',       sets: 4, reps: '10–12 reps', load: '10 kg plate · 3-sec lower',          video: 'https://youtu.be/MeIiIdhvXT4' },
    { id: 'reverse-lunge', name: 'Reverse Lunge',      sets: 3, reps: '10 / leg',   load: 'Hold 5 or 10 kg at chest',           video: 'https://youtu.be/RZKXLMxPF_I' },
    { id: 'hip-thrust',    name: 'Glute Bridge',       sets: 3, reps: '15 reps',    load: '10 kg on hips · pause at top',       video: 'https://youtu.be/wPM8icPu6H8' },
    { id: 'lateral-lunge', name: 'Lateral Lunge',      sets: 3, reps: '10 / side',  load: 'Hold 5 or 10 kg at chest',           video: 'https://youtu.be/R8jArZG2J6Q' },
    { id: 'wall-sit',      name: 'Wall Sit',           sets: 3, reps: '30–45 sec',  load: 'Hold 5 or 10 kg on lap to progress', video: 'https://youtu.be/JaZNYM3zAP0' },
    { id: 'plank-a',       name: 'Plank',              sets: 3, reps: '30–45 sec',  load: 'Core · brace tight',                 video: 'https://youtu.be/mH5Sfb_KTGg' },
    { id: 'dead-bug',      name: 'Dead Bug',           sets: 3, reps: '10 / side',  load: 'Core · slow tempo',                  video: 'https://youtu.be/bxn9FBrt4-A' },
  ]},
  { id: 'upper-a', name: 'Upper A', focus: 'Push & shoulders', dow: 'Tuesday', kind: 'strength', ex: [
    { id: 'pushup',       name: 'Push-up',                   sets: 4, reps: '8–12 reps',    load: 'Knees or incline to scale',         video: 'https://youtu.be/WDIpL0pjun0' },
    { id: 'ohp',          name: 'Overhead Press',            sets: 4, reps: '10–12 reps',   load: '5 kg plate · strict (start light)', video: 'https://youtu.be/BG9ojmx9RyI' },
    { id: 'pike',         name: 'Pike Push-up',              sets: 3, reps: '8–10 reps',    load: 'Hips high, head toward floor',      video: 'https://youtu.be/2b5t0Cu2nQI' },
    { id: 'halo',         name: 'Plate Halo',                sets: 3, reps: '8 / direction', load: '5 kg around head',                  video: 'https://youtu.be/ymCcWUFUfng' },
    { id: 'front-raise',  name: 'Plate Front Raise',         sets: 3, reps: '12 reps',      load: '5 kg · controlled',                 video: 'https://youtu.be/_DWz24dhDvM' },
    { id: 'oh-tri',       name: 'Overhead Triceps Extension', sets: 3, reps: '12 reps',     load: '5 kg, both hands',                  video: 'https://youtu.be/AYqg9S5FrUU' },
    { id: 'side-plank-a', name: 'Side Plank',                sets: 3, reps: '30 sec / side', load: 'Core',                             video: 'https://youtu.be/44ND4bOB-T0' },
  ]},
  { id: 'mobility-wed', name: 'Mobility & Shadow Jump Rope', focus: 'Mobility & conditioning', dow: 'Wednesday', kind: 'mobility', ex: [] },
  { id: 'lower-b', name: 'Lower B', focus: 'Hinge & posterior chain', dow: 'Thursday', kind: 'strength', ex: [
    { id: 'rdl',       name: 'Romanian Deadlift',       sets: 4, reps: '12 reps',   load: '10 kg · slow lower',                  video: 'https://youtu.be/aa57T45iFSE' },
    { id: 'bulgarian', name: 'Bulgarian Split Squat',   sets: 3, reps: '10 / leg',  load: 'Rear foot on chair, hold 5 or 10 kg', video: 'https://youtu.be/hiLF_pF3EJM' },
    { id: 'sl-bridge', name: 'Single-leg Glute Bridge', sets: 3, reps: '12 / leg',  load: 'Bodyweight · squeeze top',            video: 'https://youtu.be/HkF61M6StlY' },
    { id: 'sumo-dl',   name: 'Sumo Deadlift',           sets: 3, reps: '12 reps',   load: '10 kg between feet',                  video: 'https://youtu.be/xgb_WrJ_xtw' },
    { id: 'curtsy',    name: 'Curtsy Lunge',            sets: 3, reps: '10 / leg',  load: 'Hold 5 or 10 kg at chest',            video: 'https://youtu.be/g8mCJDtD2DQ' },
    { id: 'hollow',    name: 'Hollow Hold',             sets: 3, reps: '20–30 sec', load: 'Core',                                video: 'https://youtu.be/TNHSgs_orU0' },
    { id: 'bird-dog',  name: 'Bird Dog',                sets: 3, reps: '10 / side', load: 'Core · pause each rep',               video: 'https://youtu.be/ZdAHe9_HeEw' },
  ]},
  { id: 'upper-b', name: 'Upper B', focus: 'Pull & arms', dow: 'Friday', kind: 'strength', ex: [
    { id: 'inv-row',       name: 'Inverted Row',             sets: 4, reps: '8–12 reps', load: 'Under a sturdy table',                    video: 'https://youtu.be/6NTruShwwKk' },
    { id: 'sa-row',        name: 'Single-arm Bent-over Row', sets: 4, reps: '10 / arm',  load: '10 kg · brace on chair',                  video: 'https://youtu.be/pYcpY20QaE8' },
    { id: 'pullover',      name: 'Plate Pullover',           sets: 3, reps: '12 reps',   load: '10 kg, lying on floor',                   video: 'https://youtu.be/Qc4L9I3pHnw' },
    { id: 'plate-curl',    name: 'Plate Curl',               sets: 3, reps: '12 reps',   load: '5 kg · both hands, neutral grip',         video: 'https://youtu.be/MtXdEcW3Eog' },
    { id: 'russian-twist', name: 'Plate Russian Twist',      sets: 3, reps: '20 total',  load: '5 or 10 kg · feet off floor to progress', video: 'https://youtu.be/Yg47UxxV9Vc' },
    { id: 'reverse-plank', name: 'Reverse Plank',            sets: 3, reps: '20–30 sec', load: 'Posterior chain',                         video: 'https://youtu.be/bnu5b61vqGQ' },
    { id: 'superman',      name: 'Superman',                 sets: 3, reps: '12 reps',   load: 'Lower back · pause at top',               video: 'https://youtu.be/jTNpZIl1qU0' },
  ]},
  { id: 'mobility-sat', name: 'Mobility & Shadow Jump Rope', focus: 'Mobility & conditioning', dow: 'Saturday', kind: 'mobility', ex: [] },
  { id: 'rest-sun', name: 'Full Rest Day', focus: 'Recovery', dow: 'Sunday', kind: 'rest', ex: [] },
];

export const WEEK_TIPS: Record<number, [string, string]> = {
  1: ['Weeks 1–2', 'Re-learn the patterns. Keep <b>2–3 reps in reserve</b>. Focus on form and full range. Build the habit.'],
  3: ['Weeks 3–4', 'Push the <b>last set</b> close to failure. Aim for the top of each rep range. Tighten rest to 60 sec.'],
  5: ['Weeks 5–6', 'Hitting top reps? Slow the lowering phase to <b>3–4 sec</b>. Or add a 4th set to your main lifts.'],
  7: ['Weeks 7–8', '<b>Shorten rest to 45 sec</b> for density. Add a 5-min finisher: alternating squats and push-ups.'],
};
export function tipForWeek(w: number): [string, string] {
  let key = 1;
  [1, 3, 5, 7].forEach((k) => { if (w >= k) key = k; });
  return WEEK_TIPS[key];
}

export type InjuryFlag = { type: 'back' | 'elbow'; warn: string };
export const INJURY_FLAGS: Record<string, InjuryFlag> = {
  rdl:          { type: 'back',  warn: 'Hinge with a neutral spine only. If you feel it in your lumbar, drop to the 5 kg plate or swap today.' },
  bulgarian:    { type: 'back',  warn: 'High lumbar demand with knee tracking. Sub out on bad-back days.' },
  superman:     { type: 'back',  warn: 'Spinal extension under load. Shorten the range or skip if your lower back is tender.' },
  'plate-curl': { type: 'elbow', warn: 'Curl grip stresses the lateral elbow. Use a neutral grip and the 5 kg plate. Stop if the elbow pinches.' },
  'front-raise':{ type: 'elbow', warn: 'Repetitive elbow flexion under load. Reduce reps or swap if your elbow flares up.' },
  'oh-tri':     { type: 'elbow', warn: 'Elbow extension under load can irritate tennis elbow. Reduce range or swap.' },
};

export const SWAPS: Record<string, string[]> = {
  'goblet-squat':  ['sumo-dl', 'reverse-lunge', 'lateral-lunge'],
  'reverse-lunge': ['curtsy', 'lateral-lunge', 'goblet-squat'],
  'hip-thrust':    ['sl-bridge', 'bird-dog', 'dead-bug'],
  'lateral-lunge': ['reverse-lunge', 'curtsy', 'goblet-squat'],
  'wall-sit':      ['goblet-squat', 'hollow', 'plank-a'],
  'plank-a':       ['dead-bug', 'hollow', 'bird-dog'],
  'dead-bug':      ['bird-dog', 'plank-a', 'hollow'],
  pushup:          ['ohp', 'pike', 'oh-tri'],
  ohp:             ['pushup', 'halo', 'front-raise'],
  pike:            ['pushup', 'ohp', 'side-plank-a'],
  halo:            ['ohp', 'front-raise', 'side-plank-a'],
  'front-raise':   ['halo', 'ohp', 'pike'],
  'oh-tri':        ['pushup', 'pike', 'side-plank-a'],
  'side-plank-a':  ['plank-a', 'dead-bug', 'hollow'],
  rdl:             ['sumo-dl', 'sl-bridge', 'curtsy'],
  bulgarian:       ['reverse-lunge', 'curtsy', 'lateral-lunge'],
  'sl-bridge':     ['hip-thrust', 'bird-dog', 'dead-bug'],
  'sumo-dl':       ['rdl', 'goblet-squat', 'lateral-lunge'],
  curtsy:          ['reverse-lunge', 'lateral-lunge', 'bulgarian'],
  hollow:          ['plank-a', 'dead-bug', 'bird-dog'],
  'bird-dog':      ['dead-bug', 'hollow', 'plank-a'],
  'inv-row':       ['sa-row', 'pullover', 'plate-curl'],
  'sa-row':        ['inv-row', 'pullover', 'plate-curl'],
  pullover:        ['sa-row', 'inv-row', 'oh-tri'],
  'plate-curl':    ['inv-row', 'sa-row', 'pullover'],
  'russian-twist': ['hollow', 'plank-a', 'dead-bug'],
  'reverse-plank': ['plank-a', 'side-plank-a', 'hollow'],
  superman:        ['bird-dog', 'dead-bug', 'reverse-plank'],
};

export const FINISH_MSGS = [
  'Done. Every session counts. Every single one.',
  'Another one in the bank. Keep stacking.',
  "You showed up. That's 90% of the battle.",
  'Logged. Strong work today.',
  'Job done. Rest up, come back stronger.',
  'Session ticked off. The body is adapting.',
];

export const NUTRITION_OPTIONS = [
  { key: 'great', label: 'Great' },
  { key: 'okay', label: 'Okay' },
  { key: 'struggled', label: 'Struggled' },
  { key: 'skipped', label: 'Skipped' },
] as const;

export function dayById(id: string): Day | undefined {
  return PLAN.find((d) => d.id === id);
}
export function exerciseById(id: string): Exercise | null {
  for (const d of PLAN) {
    const e = d.ex.find((x) => x.id === id);
    if (e) return e;
  }
  return null;
}

/** A move is "timed" when its prescription is a hold/duration (planks, wall
 *  sits, hollow holds) rather than a rep count — detected from words like
 *  "sec" or "min" in the prescription string. Timed moves log a duration, not
 *  reps, so the UI labels the input "Time" and the history shows "Time held". */
export function isTimedReps(reps: string): boolean {
  return /\b(sec|second|min|minute)s?\b/i.test(reps);
}

/** Format a logged duration for display: a bare number gets a "sec" unit
 *  ("40" → "40 sec"), while a value the user already qualified ("40 sec",
 *  "1 min") is shown as-is. */
export function formatDuration(v: string): string {
  const t = v.trim();
  return /^\d+(\.\d+)?$/.test(t) ? `${t} sec` : t;
}
