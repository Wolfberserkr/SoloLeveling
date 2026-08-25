// The "Reset" 4-day GYM program — machine-based fat-loss training for a fully
// equipped commercial gym. Plan, warm-up, cool-down, week tips, injury flags,
// swap suggestions, and finish messages. Pure data + the session-time model;
// no DOM.
//
// Design brief this file implements:
//   • Mon / Tue / Thu / Fri strength · Wed / Sat mobility · Sun full rest.
//   • Goal is fat loss: 10–15 rep work, 45–60 sec rest, paired supersets for
//     density, and an interval-conditioning slot on the two upper days —
//     while every session still carries real, progressive resistance work so
//     the weight she loses is fat and not muscle.
//   • Everything runs on machines/cables (fixed path, easy to load, easy to
//     re-find week to week). Free weights only where no machine does the job:
//     the barbell squat finisher, the Smith-bar hinge, a couple of dumbbell
//     reserves.
//   • Every strength day ENDS on a squat, alternating across the week:
//     Mon back squat → Tue front squat → Thu back squat → Fri front squat.
//     Squatting 4×/week only works if the load is honest: the two back-squat
//     days are MODERATE (ramp set + 3 × 6–8 @ RPE 7, three reps in the tank)
//     and the two front-squat days are deliberately light technique work.
//   • Every session fits inside an hour — and that is enforced by code, not
//     by a comment: see estimateMinutes() below. Every Day.estMin is computed
//     from the day's own exercise data, and tests/resetPlan.test.ts asserts
//     the function's output (at week 2 AND at week 8) never exceeds 60.

export type Exercise = {
  id: string;
  name: string;
  sets: number;
  reps: string;
  load: string;
  video: string;
  /** Seconds per rep, lowering + lifting + pause. Defaults to DEFAULT_TEMPO.
   *  Slow-tempo cues in `load` must be reflected here — a 15–20 rep calf
   *  raise at "2-sec lower, 1-sec squeeze" is a 60-second set, not 45. */
  tempo?: number;
  /** Rest in seconds after each set (after each round, for a superset). */
  rest?: number;
  /** Superset key. Adjacent exercises sharing a key alternate as one block. */
  pair?: string;
  /** Override the station-setup cost (mobility moves flow, they don't queue). */
  setup?: number;
  /** Barbell squat rack: walk over, J-hooks, safety pins, load, plate changes. */
  rack?: boolean;
  /** Set 1 is a light ramp set, not a working set. Counted in `sets` so the
   *  checkboxes match reality, and labelled "Ramp" in the day view. */
  ramp?: boolean;
  /** Timed conditioning block — the week 7–8 progression retunes these. */
  conditioning?: boolean;
  /** Only ever set on the stubs exerciseById() synthesises for RETIRED ids. */
  retired?: boolean;
};

export type DayKind = 'strength' | 'mobility' | 'rest';
export type Day = {
  id: string;
  name: string;
  focus: string;
  ex: Exercise[];
  dow?: string;
  kind?: DayKind;
  /** Estimated door-to-door session length in minutes. Never hand-written —
   *  every value is produced by estimateMinutes() from the day's exercises. */
  estMin?: number;
};

// ── SESSION TIME MODEL ───────────────────────────────────────────────────────
// The one-hour cap is a hard constraint, so it is executable: estimateMinutes()
// costs a day out of its own data, PLAN derives every estMin from it, and the
// test suite asserts the result stays under 60 both at week 2 (full volume,
// 60-sec rests) and at week 8 (density rests + the longer interval block).
// Change the plan and the number moves with it; add sets and the test fails.
//
// The model is deliberately pessimistic — this is a real gym floor:
//   • work set   = reps × tempo, where a "12 / side" prescription is 24 reps.
//   • logging    = 10 s per set. This is a logging app: 16–20 sets of tapping
//                  a checkbox and two number fields is 3 minutes, and that is
//                  priced separately from contingency so contingency really
//                  does cover a busy machine.
//   • station    = 60 s to walk over and set a seat/pin, 90 s to claim the two
//                  stations of a superset, 300 s for the squat rack (walk,
//                  J-hooks, safety pins, loading, plate changes between the
//                  ramp set and the working sets).
//   • warm-up    = 480 s: the 5-min cardio piece plus the dynamic prep that
//                  follows it (WARMUP has five items; 6 min never covered it).
//   • cool-down  = 300 s · contingency = 180 s (one occupied machine).
//   • mobility days swap the warm-up for the 8-min lymphatic-drainage flow,
//     which DayView renders at the top of the page, so it is priced in.
//
// Current output (the estimate test holds the live values to the cap):
//   Mon 58 · Tue 58 · Thu 59 · Fri 59 · Wed/Sat 40 — all inside the hour.
//
// THE TRADE THIS BUYS — stated, not hidden. Weekly set tally is roughly
// quads 19 · glutes 16 · hamstrings 10 · core 9 · lats 7 · upper back 6 ·
// chest 4 · delts 3 · triceps 3 · biceps 3 — i.e. about 51 lower to 26 upper.
// That is forced arithmetic, not sloppiness: four squat finishers plus a hard
// hour leaves the upper days roughly three resistance blocks each after the
// interval slot (re-pairing the pec deck into Tuesday puts that day at 61 min
// and fails the cap test). Upper-body volume is therefore deliberately the
// minimum that holds muscle while the squat pattern and the fat-loss density
// work get the minutes. If a session ever finishes early, the pec deck and
// the calf raises in RESERVE are the first two things to add back.
export const TIME_MODEL = {
  warmupSec: 480,
  cooldownSec: 300,
  lymphSec: 480,
  contingencySec: 180,
  logSecPerSet: 10,
  stationSec: 60,
  supersetStationSec: 90,
  rackSec: 300,
  transferSec: 15,
  defaultTempo: 3,
  defaultRest: 60,
  /** Unrack, walk out, re-rack — a barbell set is not a leg-extension set. */
  barbellHandlingSec: 15,
  /** Weeks 6+ pull superset rests down to this (see WEEK_TIPS). */
  densityRestSec: 45,
  /** Week 5 deload: at most this many sets per exercise (see WEEK_TIPS). */
  deloadSets: 2,
  /** Weeks 7–8 intervals: more rounds bought with shorter recoveries. */
  peakIntervalRounds: 6,
  peakIntervalWorkSec: 40,
  peakIntervalRestSec: 30,
} as const;

/** Total reps in one set of a prescription — "12 / side" is 24 reps of work,
 *  "10 total" is 10. Returns null for a timed prescription. */
export function repCount(reps: string): number | null {
  if (isTimedReps(reps)) return null;
  const nums = reps.match(/\d+/g);
  if (!nums) return null;
  const top = Math.max(...nums.map(Number));
  return /\/\s*(side|leg|arm|direction)/i.test(reps) ? top * 2 : top;
}

/** Seconds of work in one set: a hold/interval runs for its prescribed time,
 *  everything else is reps × tempo. */
export function setSeconds(ex: Exercise): number {
  if (isTimedReps(ex.reps)) {
    const nums = ex.reps.match(/\d+/g);
    const top = nums ? Math.max(...nums.map(Number)) : 30;
    return /\bmin/i.test(ex.reps) ? top * 60 : top;
  }
  const reps = (repCount(ex.reps) ?? 10) * (ex.tempo ?? TIME_MODEL.defaultTempo);
  // A barbell set also costs the unrack, the walk-out and the re-rack.
  return reps + (ex.rack ? TIME_MODEL.barbellHandlingSec : 0);
}

export type EstimateOpts = {
  /** Program week — 1 is the half-volume ramp-in, 6+ runs density rests,
   *  7+ runs the longer interval block. Defaults to 2 (full volume). */
  week?: number;
};

/** One exercise as it is actually performed in a given program week. */
function weekView(ex: Exercise, week: number): { sets: number; work: number; rest: number } {
  let sets = ex.sets;
  let work = setSeconds(ex);
  let rest = ex.rest ?? TIME_MODEL.defaultRest;
  if (week <= 1) sets = Math.max(1, Math.ceil(sets / 2));          // week 1 ramp-in
  if (week === 5) sets = Math.min(sets, TIME_MODEL.deloadSets);    // week 5 deload
  if (week >= 6 && ex.pair) rest = Math.min(rest, TIME_MODEL.densityRestSec);
  if (week >= 7 && ex.conditioning) {
    sets = TIME_MODEL.peakIntervalRounds;
    work = TIME_MODEL.peakIntervalWorkSec;
    rest = TIME_MODEL.peakIntervalRestSec;
  }
  return { sets, work, rest };
}

/** Split a day into blocks: consecutive exercises sharing a `pair` key run as
 *  one alternating superset, everything else is a straight-set block. */
function blocksOf(day: Day): Exercise[][] {
  const out: Exercise[][] = [];
  for (const ex of day.ex) {
    const last = out[out.length - 1];
    if (last && ex.pair && last[0].pair === ex.pair) last.push(ex);
    else out.push([ex]);
  }
  return out;
}

/** Door-to-door session length in seconds, costed from the day's own data. */
export function estimateSeconds(day: Day, opts: EstimateOpts = {}): number {
  if (day.kind === 'rest' || day.ex.length === 0) return 0;
  const week = opts.week ?? 2;
  const T = TIME_MODEL;
  let total = (day.kind === 'mobility' ? T.lymphSec : T.warmupSec) + T.cooldownSec + T.contingencySec;

  for (const block of blocksOf(day)) {
    const views = block.map((ex) => weekView(ex, week));
    const rounds = Math.max(...views.map((v) => v.sets));
    // The pair rests as long as its most demanding member asks for — taking
    // the minimum would silently under-count a 45/90 pairing.
    const rest = Math.max(...views.map((v) => v.rest));
    const setup = block[0].setup
      ?? (block[0].rack ? T.rackSec : block.length > 1 ? T.supersetStationSec : T.stationSec);
    const perRound =
      views.reduce((a, v) => a + v.work + T.logSecPerSet, 0) + T.transferSec * (block.length - 1);
    // The rest after the final round overlaps the walk to the next station.
    total += setup + rounds * perRound + Math.max(0, rounds - 1) * rest;
  }
  return total;
}

/** Session length in whole minutes, rounded up. The hard cap is 60. */
export function estimateMinutes(day: Day, opts: EstimateOpts = {}): number {
  return Math.ceil(estimateSeconds(day, opts) / 60);
}

/** Gym warm-up for the four strength days — priced at 8 min in the model.
 *  (The at-home lymphatic-drainage video doesn't fit a gym floor; it now
 *  lives on the mobility and rest days, where it still makes sense.) */
export const WARMUP = [
  '5 min easy cardio — treadmill on a slight incline, bike or rower · finish warm and breathing, not tired',
  'Leg swings — 10 front-to-back + 10 side-to-side each leg',
  'Bodyweight squat to full depth — 10 slow reps',
  'Cable or band face pull — 15 reps',
  "First machine of the day: 1 ramp set of 10 at half your working weight — that's your last form check",
];

/** What to cut when the clock is winning. Surfaced in the day view, not just
 *  here — she is the one standing in the gym at minute 45. */
export const TRIM_ORDER = [
  'Running behind? Skip the phone between sets first — most lost time is there.',
  'Then drop the last accessory block (the core / isolation pair).',
  'Then take the supersets from 3 rounds down to 2, keeping the load.',
  'Rack queued at 7 am? Do not wait and do not skip it — swap the finisher to the Smith machine squat (⇄ on the exercise) and keep the day intact.',
  'Never cut: the warm-up, the first machine of the day, or the squat finisher.',
];

/** Lymphatic-drainage flow — kept from the home program. Shown on the mobility
 *  days and the rest day, where a floor-based recovery flow actually fits. */
export const LYMPH_VIDEO = 'https://youtu.be/hFteQ6JXoN0?si=U_flnlnERvn9dGHN';

/** Cool-down for the gym days. */
export const COOLDOWN = [
  '2 min easy walk or spin — bring the heart rate down before you leave the floor',
  'Standing forward fold — 30 sec, breathe into the hamstrings',
  'Figure-4 glute stretch on a mat — 30 sec each side',
  'Rack or doorway chest stretch — 30 sec each side',
  "Child's pose — 45 sec, slow nasal breathing",
];

/** Cool-down for the mobility days — floor work, no gym floor to leave. */
export const MOBILITY_COOLDOWN = [
  'Standing forward fold — 30 sec, let the head hang heavy',
  'Figure-4 glute stretch — 45 sec each side',
  'Seated butterfly or straddle — 1 min, breathe into the hips',
  "Child's pose — 1 min, slow nasal breathing",
  'Legs up the wall — 1 min, let the heart rate settle',
];

// Mobility & shadow-jump-rope days (Wed / Sat) — a shared conditioning + joint-
// prep flow. Built as real exercises (sets, reps/time, a demo video per move)
// so these days log and track exactly like the strength days. Exercise ids are
// suffixed per day so Wednesday and Saturday keep independent set progress and
// rep logs (the log map is keyed by exercise id across the whole program).
// Short setup/rest values: these moves flow one into the next on a mat.
function shadowJumpDay(sfx: string): Exercise[] {
  return [
    { id: `jump-rope-${sfx}`,  name: 'Shadow Jump Rope',         sets: 5, reps: '45 sec',         load: 'No rope · light bounce · rest 20 sec between rounds', video: 'https://youtu.be/Fdw--dqQAzA', rest: 20, setup: 20 },
    { id: `ankle-circ-${sfx}`, name: 'Ankle Circles',            sets: 2, reps: '20 / side',      load: 'Slow, controlled circles both directions',           video: 'https://youtu.be/om1IAdzpKsg', tempo: 1,   rest: 20, setup: 20 },
    { id: `hip-circ-${sfx}`,   name: 'Hip Circles',              sets: 2, reps: '20 / direction', load: 'Hands on hips · big smooth circles',                 video: 'https://youtu.be/JYqLwajOGjI', tempo: 1,   rest: 20, setup: 20 },
    { id: `cat-cow-${sfx}`,    name: 'Cat–Cow',                  sets: 2, reps: '10 reps',        load: 'Spine · move slowly with the breath',                video: 'https://youtu.be/vuyUwtHl694', tempo: 3,   rest: 20, setup: 20 },
    { id: `t-rot-${sfx}`,      name: 'Thoracic Rotations',       sets: 2, reps: '8 / side',       load: 'Quadruped · open the mid-back',                      video: 'https://youtu.be/z2zv526I7M8', tempo: 3,   rest: 20, setup: 20 },
    { id: `wgs-${sfx}`,        name: "World's Greatest Stretch", sets: 2, reps: '4 / side',       load: 'Full-body mobility flow · hold each position',       video: 'https://youtu.be/-CiWQ2IvY34', tempo: 8,   rest: 20, setup: 20 },
    { id: `hip-9090-${sfx}`,   name: '90/90 Hip Switches',       sets: 2, reps: '10 total',       load: 'Tall chest · rotate the hips slowly',                video: 'https://youtu.be/wnFTIPhNySI', tempo: 3,   rest: 20, setup: 20 },
    { id: `squat-hold-${sfx}`, name: 'Deep Squat Hold',          sets: 2, reps: '45 sec',         load: 'Sink low · pry the knees out',                       video: 'https://youtu.be/0wzrgyAurT8', rest: 20, setup: 20 },
  ];
}

// Full rest day (Sun). Optional light recovery — nothing to log.
export const REST_TIPS = [
  'Gentle 20–30 min walk if you feel like moving — outside beats a treadmill today',
  'Run the lymphatic-drainage flow below, or foam-roll anything the week left tight',
  'Hydrate well, get protein in, and aim for an early night',
  'Let the body absorb the week — rest is where the progress lands',
];

// Equipment: a fully equipped commercial gym. Ordered as a Mon–Sun week:
// strength Mon/Tue/Thu/Fri, mobility Wed/Sat, rest Sun. Day ids are frozen —
// logged history and the navigation tests key off them.
//
// NOTE ON VIDEOS: every movement carries a demo. The machine moves were
// sourced from real YouTube search results — never a guessed id, because a
// guessed id is a dead embed and worse than none. The home program's own
// verified URLs are carried over for the moves that survived (the mobility
// flow, planks, holds). Embedding is the uploader's choice, so if one refuses
// to play inline, DayView still offers the "Search YouTube" link and a
// paste-and-save field to replace it permanently.
//
// NOTE ON WHAT'S NOT HERE: calf raises, pec deck, hack squat, ab crunch and
// the assisted pull-up all live in RESERVE rather than in a day. The hour is
// the binding constraint, and isolation work is the first thing a fat-loss
// program spends its minutes on last. They are one tap away in the swap menu.
const PLAN_SPEC: Day[] = [
  { id: 'lower-a', name: 'Lower A', focus: 'Legs, glutes & core · back-squat finisher', dow: 'Monday', kind: 'strength', ex: [
    { id: 'leg-press',       name: 'Leg Press',          sets: 4, reps: '12–15 reps', tempo: 3,   rest: 60, load: 'Feet mid-platform, hip-width · lower to 90°, no lumbar tuck · 2 reps in reserve, last set all-out · rest 60 sec',   video: 'https://youtu.be/K5n2vg3oZa4' },
    { id: 'leg-curl-seated', name: 'Seated Leg Curl',    sets: 3, reps: '12–15 reps', tempo: 3.5, rest: 60, pair: 'A', load: 'SUPERSET A1 · knee joint on the machine pivot · 2-sec lower, no swinging',                                  video: 'https://youtu.be/Wy1SwoY2aaQ' },
    { id: 'leg-extension',   name: 'Leg Extension',      sets: 3, reps: '12–15 reps', tempo: 3,   rest: 60, pair: 'A', load: 'SUPERSET A2 · 1-sec squeeze at the top · rest 45–60 sec after the pair, then straight back to A1',          video: 'https://youtu.be/3zWKiW9BBpo' },
    { id: 'glute-drive',     name: 'Hip Thrust Machine', sets: 3, reps: '12–15 reps', tempo: 3.5, rest: 60, pair: 'B', load: 'SUPERSET B1 · pad low on the hips · drive through the heels, 1-sec squeeze at lockout',                     video: 'https://youtu.be/tztHvSLdXLA' },
    { id: 'dead-bug',        name: 'Dead Bug',           sets: 3, reps: '8 / side',   tempo: 3,   rest: 60, pair: 'B', load: 'SUPERSET B2 · anti-extension core — lower back glued to the mat, exhale as the leg lowers · this is the back insurance', video: 'https://youtu.be/bxn9FBrt4-A' },
    { id: 'back-squat-mon',  name: 'Barbell Back Squat', sets: 4, reps: '6–8 reps',   tempo: 4,   rest: 90, rack: true, ramp: true, load: 'FINISHER · set 1 is a ramp at ~50% · then 3 working sets at RPE 7 — leave 3 reps in the tank · brace before every rep · rest 90 sec', video: 'https://youtu.be/f-KL4VNN96E' },
  ]},
  { id: 'upper-a', name: 'Upper A', focus: 'Push, shoulders & intervals', dow: 'Tuesday', kind: 'strength', ex: [
    { id: 'chest-press',     name: 'Chest Press Machine',     sets: 4, reps: '10–12 reps', tempo: 3, rest: 60, load: 'Handles level with mid-chest · press without slamming the elbows straight · last set close to failure · rest 60 sec · add the pec deck after this one if a day runs short', video: 'https://youtu.be/gNBU7hmW2EU' },
    { id: 'stair-intervals', name: 'Stair Climber Intervals', sets: 5, reps: '40 sec',     rest: 40, conditioning: true, load: 'CONDITIONING · 40 sec brisk / 40 sec easy · effort 7/10 — short sentences only · rower or bike works the same', video: 'https://youtu.be/SZU9Rm0sNOo' },
    { id: 'shoulder-press',  name: 'Shoulder Press Machine',  sets: 3, reps: '10–12 reps', tempo: 3, rest: 60, pair: 'A', load: 'SUPERSET A1 (press) · seat high enough that the handles start at ear level · ribs down',                   video: 'https://youtu.be/BAZkFGeUy5U' },
    { id: 'rear-delt-fly',   name: 'Rear-Delt Fly Machine',   sets: 3, reps: '12–15 reps', tempo: 3, rest: 60, pair: 'A', load: 'SUPERSET A2 (pull) · pairs against the press so nothing is pre-fatigued · lead with the elbows, pause at the back', video: 'https://youtu.be/v0rJuhEa59c' },
    { id: 'tri-pushdown',    name: 'Cable Triceps Pushdown',  sets: 3, reps: '12–15 reps', tempo: 3, rest: 45, load: 'ROPE, neutral grip — kinder on the elbow than a straight bar · elbows pinned to the ribs · rest 45 sec',              video: 'https://youtu.be/vPeQu_L-1n0' },
    { id: 'front-squat-tue', name: 'Barbell Front Squat',     sets: 4, reps: '8 reps',     tempo: 4, rest: 75, rack: true, ramp: true, load: 'FINISHER · technique day: set 1 is an empty-bar ramp, then 3 LIGHT sets · elbows high, 3-sec lower · quality, never a grind · rest 75 sec', video: 'https://youtu.be/GaZmLWUP85Q' },
  ]},
  { id: 'mobility-wed', name: 'Mobility & Shadow Jump Rope', focus: 'Mobility & conditioning', dow: 'Wednesday', kind: 'mobility', ex: shadowJumpDay('wed') },
  { id: 'lower-b', name: 'Lower B', focus: 'Hinge, hips & core · back-squat finisher', dow: 'Thursday', kind: 'strength', ex: [
    { id: 'leg-curl-lying', name: 'Lying Leg Curl',        sets: 4, reps: '10–12 reps', tempo: 3.5, rest: 60, load: 'Hips flat on the pad · 2-sec lower · last set close to failure · rest 60 sec',                                          video: 'https://youtu.be/i6m3Vp9H40Y' },
    { id: 'smith-rdl',      name: 'Smith Machine RDL',     sets: 3, reps: '10–12 reps', tempo: 4,   rest: 90, load: 'STRAIGHT SETS, full 90-sec rest — the one hinge in the week is never rushed · bar grazing the legs, hips back, flat back · stop at mid-shin', video: 'https://youtu.be/nmGzbW15qYo' },
    { id: 'hip-adduction',  name: 'Hip Adduction Machine', sets: 3, reps: '12–15 reps', tempo: 3,   rest: 60, pair: 'A', load: 'SUPERSET A1 · controlled squeeze, never bounce out of the stretch',                                          video: 'https://youtu.be/CjAVezAggkI' },
    { id: 'hip-abduction',  name: 'Hip Abduction Machine', sets: 3, reps: '12–15 reps', tempo: 3,   rest: 60, pair: 'A', load: 'SUPERSET A2 · same seat, opposite job · lean the torso slightly forward · rest 45–60 sec after the pair',    video: 'https://youtu.be/OjI5OpV6IWA' },
    { id: 'bird-dog',       name: 'Bird Dog',              sets: 3, reps: '8 / side',   tempo: 3,   rest: 45, load: 'Anti-extension core · pause each rep, hips level, no rotation · rest 45 sec',                                           video: 'https://youtu.be/ZdAHe9_HeEw' },
    { id: 'back-squat-thu', name: 'Barbell Back Squat',    sets: 4, reps: '6–8 reps',   tempo: 4,   rest: 90, rack: true, ramp: true, load: 'FINISHER · set 1 is a ramp at ~50% · then 3 working sets at RPE 7 — leave 3 reps in the tank · same weight as Monday, no hero sets after the hinge · rest 90 sec', video: 'https://youtu.be/f-KL4VNN96E' },
  ]},
  { id: 'upper-b', name: 'Upper B', focus: 'Pull, arms & intervals', dow: 'Friday', kind: 'strength', ex: [
    { id: 'lat-pulldown',   name: 'Lat Pulldown',            sets: 4, reps: '10–12 reps', tempo: 3,   rest: 60, load: 'Neutral / V-handle if the elbow is grumpy · pull to the collarbone, chest tall, no leaning back · rest 60 sec', video: 'https://youtu.be/CAwf7n6Luuc' },
    { id: 'row-intervals',  name: 'Rowing Machine Intervals', sets: 5, reps: '40 sec',    rest: 40, conditioning: true, load: 'CONDITIONING · 40 sec hard / 40 sec easy · legs → hips → arms, in that order · stair climber or bike is fine', video: 'https://youtu.be/4zWu1yuJ0_g' },
    { id: 'cable-row',      name: 'Seated Cable Row',        sets: 3, reps: '10–12 reps', tempo: 3.5, rest: 60, pair: 'A', load: 'SUPERSET A1 · pull to the belly button, shoulders down and back · 1-sec squeeze',                     video: 'https://youtu.be/OeLb503NZHk' },
    { id: 'cable-woodchop', name: 'Cable Woodchop',          sets: 3, reps: '10 / side',  tempo: 2.5, rest: 60, pair: 'A', load: 'SUPERSET A2 (core) · high-to-low · turn from the ribcage, hips square · light · rest 45–60 sec after the pair', video: 'https://youtu.be/Gwcf4TOj1hc' },
    { id: 'cable-curl',     name: 'Cable Biceps Curl',       sets: 3, reps: '12 reps',    tempo: 3,   rest: 45, load: 'Rope or EZ attachment, never a straight bar · elbows still at the ribs · rest 45 sec',                          video: 'https://youtu.be/5jxkRHU4spk' },
    { id: 'front-squat-fri', name: 'Barbell Front Squat',    sets: 4, reps: '8 reps',     tempo: 4,   rest: 75, rack: true, ramp: true, load: 'FINISHER · technique day: set 1 is an empty-bar ramp, then 3 LIGHT sets · cross-arm grip if the front rack hurts · 3-sec lower · rest 75 sec', video: 'https://youtu.be/GaZmLWUP85Q' },
  ]},
  { id: 'mobility-sat', name: 'Mobility & Shadow Jump Rope', focus: 'Mobility & conditioning', dow: 'Saturday', kind: 'mobility', ex: shadowJumpDay('sat') },
  { id: 'rest-sun', name: 'Full Rest Day', focus: 'Recovery', dow: 'Sunday', kind: 'rest', ex: [] },
];

/** The week, with every estimate derived from the day's own exercise data. */
export const PLAN: Day[] = PLAN_SPEC.map((d) =>
  d.kind === 'rest' ? d : { ...d, estMin: estimateMinutes(d) },
);

// An 8-week fat-loss progression for machine training: learn the machines and
// record the settings → add load → deload, then raise density → intervals.
// Every step is TIME-NEUTRAL: intensity is bought with shorter rests, never
// with extra rounds, because the hour is the constraint that never moves.
export const WEEK_TIPS: Record<number, [string, string]> = {
  1: ['Weeks 1–2', 'Week 1 is a ramp-in: <b>half the sets</b> (two per exercise, ramp + one working set on the squat) while you learn the machines — write down every seat height and pin. Week 2: full sets, 2–3 reps in reserve.'],
  3: ['Weeks 3–4', '<b>Add load.</b> Hit the top of the rep range on every set and the pin moves one notch deeper next session. Last set of each main machine goes close to failure — the squat stays at RPE 7.'],
  5: ['Weeks 5–6', '<b>Week 5 is a deload</b>: 2 sets per exercise, same loads, stop 3 reps short — the plan card will show the shorter session. Week 6 raises density instead of volume: superset rests down to <b>45 sec</b> at the loads you deloaded from.'],
  7: ['Weeks 7–8', 'Intervals go to <b>6 rounds of 40 sec hard / 30 sec easy</b> — intensity bought with shorter recoveries, not extra rounds, so the session still fits the hour. Squat stays at three working sets; in week 8, re-test your week-1 loads.'],
};
export function tipForWeek(w: number): [string, string] {
  let key = 1;
  [1, 3, 5, 7].forEach((k) => { if (w >= k) key = k; });
  return WEEK_TIPS[key];
}

// Sensitive lower back + tennis-elbow-prone elbows. Flags follow the movement,
// not the day: anything that loads the spine (barbell squats, the hinge, back
// extensions, loaded rotation) is a BACK flag; anything that hammers the elbow
// tendons (pushdowns, curls, straight-bar hangs) is an ELBOW flag.
export type InjuryFlag = { type: 'back' | 'elbow'; warn: string };
export const INJURY_FLAGS: Record<string, InjuryFlag> = {
  'back-squat-mon':  { type: 'back',  warn: 'Loaded spine. Brace before every rep and never let the lower back round out of the bottom. RPE 7 means it should look easy — if it barks, swap to the Smith squat or hack squat.' },
  'back-squat-thu':  { type: 'back',  warn: 'This lands after the hinge, so the erectors are already taxed. Same weight as Monday, three reps in the tank, and stop the set the moment the back rounds.' },
  'front-squat-tue': { type: 'back',  warn: 'Front-loaded, but the spine still pays. Keep it light and upright; drop the weight before you lose the torso position.' },
  'front-squat-fri': { type: 'back',  warn: 'Front-loaded, but the spine still pays. Keep it light and upright; drop the weight before you lose the torso position.' },
  'smith-rdl':       { type: 'back',  warn: 'Hinge with a neutral spine only — that is why this one gets full rest and no superset. Stop at mid-shin. If you feel it in the lumbar, shorten the range or swap to the leg curl.' },
  'back-extension':  { type: 'back',  warn: 'Spinal extension under load. Stop at a straight line — never arch past it — and skip it entirely if your lower back is tender.' },
  'cable-woodchop':  { type: 'back',  warn: 'Loaded rotation. Turn from the ribcage with the hips square, keep it light, and stop if the lower back joins in.' },
  'tri-pushdown':    { type: 'elbow', warn: 'Classic tennis-elbow trigger. Rope only, elbows pinned, no locking out hard. Stop if the outer elbow pinches.' },
  'cable-curl':      { type: 'elbow', warn: 'Curl grip loads the lateral elbow. Rope or EZ bar, never straight. Drop the weight before you cheat the rep.' },
  'assisted-pullup': { type: 'elbow', warn: 'Straight-bar hanging can flare the elbow. Use neutral handles and more assist rather than grinding out reps — and never do these pre-fatigued.' },
  'oh-cable-triceps': { type: 'elbow', warn: 'Overhead elbow extension under load. Reduce the range or swap to the pushdown if the tendon complains.' },
  'preacher-machine': { type: 'elbow', warn: 'The pad locks the elbow in one line — great for the biceps, hard on a sore tendon. Light weight, slow lower, stop early.' },
};

export const SWAPS: Record<string, string[]> = {
  // ── Monday · Lower A ──
  'leg-press':       ['hack-squat', 'leg-press-single', 'smith-squat'],
  'leg-curl-seated': ['leg-curl-lying', 'back-extension', 'glute-kickback'],
  'leg-extension':   ['hack-squat', 'leg-press-single', 'goblet-squat'],
  'glute-drive':     ['glute-kickback', 'back-extension', 'hip-abduction'],
  'dead-bug':        ['plank', 'hollow', 'pallof-press'],
  // Squat finishers only ever swap to another squat pattern — the day has to
  // end on a squat, so a leg press is not an acceptable substitute.
  'back-squat-mon':  ['smith-squat', 'hack-squat', 'goblet-squat'],
  // ── Tuesday · Upper A ──
  'chest-press':     ['incline-press-machine', 'pec-deck', 'db-flat-press'],
  'stair-intervals': ['treadmill-intervals', 'bike-intervals', 'row-intervals'],
  'shoulder-press':  ['db-shoulder-press', 'cable-lateral-raise', 'incline-press-machine'],
  'rear-delt-fly':   ['face-pull', 'machine-row', 'cable-lateral-raise'],
  'tri-pushdown':    ['oh-cable-triceps', 'dip-machine', 'pushup'],
  'front-squat-tue': ['smith-squat', 'hack-squat', 'goblet-squat'],
  // ── Thursday · Lower B ──
  'leg-curl-lying':  ['leg-curl-seated', 'back-extension', 'glute-kickback'],
  'smith-rdl':       ['back-extension', 'glute-drive', 'glute-kickback'],
  'hip-adduction':   ['glute-kickback', 'cossack-squat', 'leg-press-single'],
  'hip-abduction':   ['glute-kickback', 'fire-hydrants', 'leg-press-single'],
  'bird-dog':        ['plank', 'pallof-press', 'hollow'],
  'back-squat-thu':  ['smith-squat', 'hack-squat', 'goblet-squat'],
  // ── Friday · Upper B ──
  'lat-pulldown':    ['assisted-pullup', 'machine-row', 'straight-arm-pushdown'],
  'row-intervals':   ['bike-intervals', 'treadmill-intervals', 'stair-intervals'],
  'cable-row':       ['machine-row', 'db-row', 'straight-arm-pushdown'],
  'cable-woodchop':  ['pallof-press', 'cable-crunch', 'side-plank'],
  'cable-curl':      ['hammer-curl', 'preacher-machine', 'db-row'],
  'front-squat-fri': ['smith-squat', 'hack-squat', 'goblet-squat'],
};

// Reserve pool — alternatives that are NOT shown in any day by default. They
// exist only as swap targets, so a day can be re-shaped when a machine is
// occupied (or a joint is complaining). Resolved via exerciseById like any
// other exercise. Verified demo videos carried over from the home program are
// reused; genuinely new gym movements ship with an empty video (see the note
// above PLAN) and DayView's "Search YouTube" link fills the gap in seconds.
export const RESERVE: Exercise[] = [
  // Squat / leg alternates — the busy-rack answers
  { id: 'smith-squat',      name: 'Smith Machine Squat',  sets: 3, reps: '8–10 reps',   tempo: 4,   load: 'Rack busy? Feet slightly forward, brace, controlled lower · fixed path is easier on the back',  video: 'https://youtu.be/3PpzYOubZ5A' },
  { id: 'goblet-squat',     name: 'Goblet Squat',         sets: 3, reps: '10–12 reps',  tempo: 3.5, load: 'Dumbbell or kettlebell at the chest · 3-sec lower · the always-available squat',                 video: 'https://youtu.be/MeIiIdhvXT4' },
  { id: 'hack-squat',       name: 'Hack Squat',           sets: 3, reps: '10–12 reps',  tempo: 3.5, load: 'Feet mid-platform · down to parallel, no deeper · back flat on the pad',                          video: 'https://youtu.be/-lAnEGH2blE' },
  { id: 'leg-press-single', name: 'Single-leg Leg Press', sets: 3, reps: '10 / leg',    tempo: 3,   load: 'Foot centred on the platform · half the load, twice the glute · slow, hips level',                video: 'https://youtu.be/FU7FqGTtCMk' },
  { id: 'glute-kickback',   name: 'Cable Glute Kickback', sets: 3, reps: '12–15 / leg', tempo: 2.5, load: 'Ankle strap · push back and up, no arching the lower back',                                       video: 'https://youtu.be/5jJNfIlKTmg' },
  { id: 'back-extension',   name: '45° Back Extension',   sets: 3, reps: '12–15 reps',  tempo: 3,   load: 'Bodyweight only · rise to a straight line and stop — do not arch past it',                        video: 'https://youtu.be/1TAbsYDMZS4' },
  { id: 'wall-sit',         name: 'Wall Sit',             sets: 3, reps: '30–45 sec',   load: 'Thighs parallel · hold a plate on the lap to progress',                                                       video: 'https://youtu.be/JaZNYM3zAP0' },
  { id: 'calf-standing',    name: 'Standing Calf Raise',  sets: 3, reps: '12–15 reps',  tempo: 4,   load: 'Full stretch at the bottom, 1-sec hold at the top · the first thing to add if a day runs short',  video: 'https://youtu.be/SVtg-1loH4c' },
  { id: 'calf-seated',      name: 'Seated Calf Raise',    sets: 3, reps: '12–15 reps',  tempo: 4,   load: '2-sec lower, 1-sec squeeze · soleus work, easy on everything else',                               video: 'https://youtu.be/I1uQtobaNRQ' },
  // Push alternates
  { id: 'pec-deck',              name: 'Pec Deck',                    sets: 3, reps: '12–15 reps', tempo: 3,   load: 'Soft elbows, 1-sec squeeze · the low-fatigue chest option',                       video: 'https://youtu.be/mEBBK9_vuJg' },
  { id: 'incline-press-machine', name: 'Incline Chest Press Machine', sets: 3, reps: '10–12 reps', tempo: 3,   load: 'Upper-chest bias · handles at collarbone height · 1-sec pause off the chest',     video: 'https://youtu.be/LiDArz1R2NU' },
  { id: 'db-flat-press',         name: 'Dumbbell Bench Press',        sets: 3, reps: '10–12 reps', tempo: 3,   load: 'When every press machine is taken · elbows ~45°, control the lower',              video: 'https://youtu.be/5Y3VZsLb1Ys' },
  { id: 'cable-fly',             name: 'Cable Chest Fly',             sets: 3, reps: '12–15 reps', tempo: 3,   load: 'Soft elbows, hug a barrel · 1-sec squeeze in front of the sternum',               video: 'https://youtu.be/ovFc-5YdcXw' },
  { id: 'pushup',                name: 'Push-up',                     sets: 3, reps: '8–12 reps',  tempo: 3,   load: 'Zero-equipment fallback · hands on a bench to scale · body in one line',          video: 'https://youtu.be/WDIpL0pjun0' },
  { id: 'db-shoulder-press',     name: 'Dumbbell Shoulder Press',     sets: 3, reps: '10–12 reps', tempo: 3,   load: 'Seated with back support · ribs down, press to just short of lockout',            video: 'https://youtu.be/vlFGTI5JzjI' },
  { id: 'cable-lateral-raise',   name: 'Cable Lateral Raise',         sets: 3, reps: '12–15 / side', tempo: 2.5, load: 'Light · lead with the elbow to shoulder height, no shrugging',                  video: 'https://youtu.be/zpbm-xRHB6k' },
  { id: 'face-pull',             name: 'Cable Face Pull',             sets: 3, reps: '15–20 reps', tempo: 2.5, load: 'Rope at eye height · pull to the forehead, thumbs back · great posture work',     video: 'https://youtu.be/eTCBSFlCJ_s' },
  { id: 'oh-cable-triceps',      name: 'Overhead Cable Triceps Extension', sets: 3, reps: '12–15 reps', tempo: 3, load: 'Rope, facing away · elbows high and still · stop short of a hard lockout',     video: 'https://youtu.be/l4i7iDLiMXs' },
  { id: 'dip-machine',           name: 'Assisted Dip Machine',        sets: 3, reps: '8–12 reps',  tempo: 3,   load: 'Torso upright for triceps · set the assist so the last rep is hard but clean',    video: 'https://youtu.be/D8RIzFsK8gA' },
  // Pull alternates
  { id: 'assisted-pullup',       name: 'Assisted Pull-up',      sets: 3, reps: '6–8 reps',   tempo: 3.5, load: 'Fresh only — never after rows · neutral handles · set the assist so the last rep is clean', video: 'https://youtu.be/fnHeovkmkkk' },
  { id: 'machine-row',           name: 'Chest-Supported Row Machine', sets: 3, reps: '10–12 reps', tempo: 3, load: 'Chest on the pad — takes the lower back out entirely · squeeze the shoulder blades',    video: 'https://youtu.be/FU6YQawma2Q' },
  { id: 'db-row',                name: 'Single-arm Dumbbell Row', sets: 3, reps: '10 / arm', tempo: 3,   load: 'Brace a hand on the bench · flat back, pull to the hip',                                    video: 'https://youtu.be/pYcpY20QaE8' },
  { id: 'straight-arm-pushdown', name: 'Straight-arm Pulldown', sets: 3, reps: '12–15 reps', tempo: 2.5, load: 'Rope, soft elbows · lats only, no elbow bend · light',                                      video: 'https://youtu.be/eKJUJ2eFPUY' },
  { id: 'hammer-curl',           name: 'Dumbbell Hammer Curl',  sets: 3, reps: '12 / arm',   tempo: 3,   load: 'Neutral grip — the most elbow-friendly curl there is · no swinging',                        video: 'https://youtu.be/8XLxfXROrTo' },
  { id: 'preacher-machine',      name: 'Machine Preacher Curl', sets: 3, reps: '12–15 reps', tempo: 3,   load: 'Armpits on the pad · light, slow lower, stop before the elbow complains',                   video: 'https://youtu.be/to3m8zws1n8' },
  // Core alternates
  { id: 'ab-crunch',    name: 'Ab Crunch Machine', sets: 3, reps: '12–15 reps', tempo: 3, load: 'Curl the ribs toward the hips — do not just fold at the hip · exhale at the bottom',    video: 'https://youtu.be/G8937xqkxDo' },
  { id: 'cable-crunch', name: 'Cable Crunch',      sets: 3, reps: '12–15 reps', tempo: 3, load: 'Kneeling, rope at the ears · curl the ribs down, hips stay put',                        video: 'https://youtu.be/aBd6T01PBqw' },
  { id: 'pallof-press', name: 'Pallof Press',      sets: 3, reps: '8 / side',   tempo: 3, load: 'Anti-rotation · press the handle straight out and resist the twist',                    video: 'https://youtu.be/xeFp4MXad98' },
  { id: 'plank',        name: 'Plank',             sets: 3, reps: '30–45 sec',  load: 'Squeeze glutes, ribs down · quality over minutes',                                                video: 'https://youtu.be/mH5Sfb_KTGg' },
  { id: 'side-plank',   name: 'Side Plank',        sets: 3, reps: '30 sec / side', load: 'Stack the hips, lift them high',                                                               video: 'https://youtu.be/44ND4bOB-T0' },
  { id: 'hollow',       name: 'Hollow Hold',       sets: 3, reps: '20–30 sec',  load: 'Lower back glued to the floor — shorten the legs if it lifts',                                    video: 'https://youtu.be/TNHSgs_orU0' },
  // Conditioning alternates
  { id: 'treadmill-intervals', name: 'Treadmill Intervals', sets: 5, reps: '40 sec', rest: 40, conditioning: true, load: '40 sec brisk incline walk or jog / 40 sec easy · effort 7/10',   video: 'https://youtu.be/vdsaHSr1H_E' },
  { id: 'bike-intervals',      name: 'Bike Intervals',      sets: 5, reps: '40 sec', rest: 40, conditioning: true, load: '40 sec hard / 40 sec spin · the joint-friendliest interval option', video: 'https://youtu.be/rlOOqDgDU3U' },
  // Mobility / bodyweight reserve — carried over from the home program
  { id: 'high-knees',        name: 'High Knees',        sets: 5, reps: '45 sec',    rest: 20, setup: 20, load: 'Drive knees to hip height · fast, light feet',           video: 'https://youtu.be/D0GwAezTvtg' },
  { id: 'jumping-jacks',     name: 'Jumping Jacks',     sets: 5, reps: '45 sec',    rest: 20, setup: 20, load: 'Full range · soft, quiet landings',                      video: 'https://youtu.be/7L-5wpilwv4' },
  { id: 'mountain-climbers', name: 'Mountain Climbers', sets: 5, reps: '45 sec',    rest: 20, setup: 20, load: 'Plank · brace the core · quick knee drive',              video: 'https://youtu.be/hq_0YlyfqGM' },
  { id: 'calf-raises',       name: 'Calf Raises',       sets: 2, reps: '15 reps',   tempo: 3, rest: 20, setup: 20, load: 'Bodyweight on a step · full range, slow',      video: 'https://youtu.be/k8ipHzKeAkQ' },
  { id: 'ankle-rockers',     name: 'Ankle Rockers',     sets: 2, reps: '10 / side', tempo: 2, rest: 20, setup: 20, load: 'Half-kneel · knee over toe, heel down',        video: 'https://youtu.be/Hm_Iu72bJJg' },
  { id: 'leg-swings',        name: 'Leg Swings',        sets: 2, reps: '12 / side', tempo: 1.5, rest: 20, setup: 20, load: 'Front-to-back · relaxed, controlled swing',  video: 'https://youtu.be/0XvKtEZ4i38' },
  { id: 'fire-hydrants',     name: 'Fire Hydrants',     sets: 2, reps: '12 / side', tempo: 2, rest: 20, setup: 20, load: 'Quadruped · lift the knee out, hips square',   video: 'https://youtu.be/1zjVNfeKvyI' },
  { id: 'thread-needle',     name: 'Thread the Needle', sets: 2, reps: '8 / side',  tempo: 3, rest: 20, setup: 20, load: 'Quadruped · reach an arm under, rotate',       video: 'https://youtu.be/MfUx9FCOb1E' },
  { id: 'open-book',         name: 'Open Book',         sets: 2, reps: '8 / side',  tempo: 3, rest: 20, setup: 20, load: 'Side-lying · open the top arm and follow it',  video: 'https://youtu.be/rDviWORCWEw' },
  { id: 'cossack-squat',     name: 'Cossack Squat',     sets: 2, reps: '6 / side',  tempo: 4, rest: 20, setup: 20, load: 'Shift side to side · heel down, chest tall',   video: 'https://youtu.be/tpczTeSkHz0' },
  { id: 'frog-stretch',      name: 'Frog Stretch',      sets: 2, reps: '30 sec',    rest: 20, setup: 20, load: 'Knees wide · rock the hips back gently',                 video: 'https://youtu.be/NHEPdNlHF2c' },
];

// Swap options for each shadow-jump move, keyed by the unsuffixed base id.
// Expanded below onto the real per-day ids.
const SHADOW_SWAPS: Record<string, string[]> = {
  'jump-rope':  ['high-knees', 'jumping-jacks', 'mountain-climbers'],
  'ankle-circ': ['calf-raises', 'ankle-rockers'],
  'hip-circ':   ['leg-swings', 'fire-hydrants', 'bird-dog'],
  'cat-cow':    ['thread-needle', 'open-book', 'bird-dog'],
  't-rot':      ['open-book', 'thread-needle'],
  'wgs':        ['cossack-squat', 'frog-stretch', 'open-book'],
  'hip-9090':   ['frog-stretch', 'fire-hydrants', 'leg-swings'],
  'squat-hold': ['wall-sit', 'cossack-squat', 'goblet-squat'],
};
for (const [base, alts] of Object.entries(SHADOW_SWAPS)) {
  SWAPS[`${base}-wed`] = alts;
  SWAPS[`${base}-sat`] = alts;
}

// Once a reserve move is swapped in it becomes the "current" exercise, so it
// needs its own alternatives to stay swappable (same as every plan move does).
Object.assign(SWAPS, {
  'smith-squat':           ['goblet-squat', 'hack-squat', 'leg-press'],
  'goblet-squat':          ['smith-squat', 'hack-squat', 'wall-sit'],
  'hack-squat':            ['leg-press', 'smith-squat', 'goblet-squat'],
  'leg-press-single':      ['leg-press', 'hack-squat', 'smith-squat'],
  'glute-kickback':        ['glute-drive', 'hip-abduction', 'back-extension'],
  'back-extension':        ['smith-rdl', 'leg-curl-lying', 'glute-drive'],
  'wall-sit':              ['goblet-squat', 'cossack-squat', 'smith-squat'],
  'calf-standing':         ['calf-seated', 'calf-raises'],
  'calf-seated':           ['calf-standing', 'calf-raises'],
  'pec-deck':              ['cable-fly', 'chest-press', 'incline-press-machine'],
  'incline-press-machine': ['chest-press', 'db-flat-press', 'pec-deck'],
  'db-flat-press':         ['chest-press', 'incline-press-machine', 'pushup'],
  'cable-fly':             ['pec-deck', 'chest-press', 'db-flat-press'],
  'pushup':                ['chest-press', 'incline-press-machine', 'pec-deck'],
  'db-shoulder-press':     ['shoulder-press', 'cable-lateral-raise', 'face-pull'],
  'cable-lateral-raise':   ['shoulder-press', 'db-shoulder-press', 'rear-delt-fly'],
  'face-pull':             ['rear-delt-fly', 'cable-lateral-raise', 'machine-row'],
  'oh-cable-triceps':      ['tri-pushdown', 'dip-machine', 'pushup'],
  'dip-machine':           ['tri-pushdown', 'oh-cable-triceps', 'chest-press'],
  'assisted-pullup':       ['lat-pulldown', 'machine-row', 'straight-arm-pushdown'],
  'machine-row':           ['cable-row', 'lat-pulldown', 'db-row'],
  'db-row':                ['cable-row', 'machine-row', 'lat-pulldown'],
  'straight-arm-pushdown': ['lat-pulldown', 'machine-row', 'cable-row'],
  'hammer-curl':           ['cable-curl', 'preacher-machine', 'db-row'],
  'preacher-machine':      ['cable-curl', 'hammer-curl', 'db-row'],
  'ab-crunch':             ['cable-crunch', 'plank', 'dead-bug'],
  'cable-crunch':          ['ab-crunch', 'plank', 'hollow'],
  'pallof-press':          ['cable-woodchop', 'side-plank', 'plank'],
  'plank':                 ['dead-bug', 'hollow', 'side-plank'],
  'side-plank':            ['plank', 'pallof-press', 'hollow'],
  'hollow':                ['plank', 'dead-bug', 'bird-dog'],
  'treadmill-intervals':   ['bike-intervals', 'row-intervals', 'stair-intervals'],
  'bike-intervals':        ['treadmill-intervals', 'row-intervals', 'stair-intervals'],
  'high-knees':            ['jumping-jacks', 'mountain-climbers', 'bike-intervals'],
  'jumping-jacks':         ['high-knees', 'mountain-climbers', 'bike-intervals'],
  'mountain-climbers':     ['high-knees', 'jumping-jacks', 'plank'],
  'calf-raises':           ['calf-standing', 'calf-seated'],
  'ankle-rockers':         ['calf-raises', 'leg-swings'],
  'leg-swings':            ['fire-hydrants', 'frog-stretch'],
  'fire-hydrants':         ['leg-swings', 'frog-stretch', 'glute-kickback'],
  'frog-stretch':          ['fire-hydrants', 'leg-swings'],
  'thread-needle':         ['open-book', 'bird-dog'],
  'open-book':             ['thread-needle', 'bird-dog'],
  'cossack-squat':         ['wall-sit', 'goblet-squat', 'frog-stretch'],
} satisfies Record<string, string[]>);

/** Exercises from the retired home program. Their ids still live in logged
 *  history, in the per-exercise log map and in the cloud PR rows, so
 *  exerciseById() resolves them to a name — otherwise the Personal Records
 *  grid counts them and then renders nothing (a row that silently vanishes).
 *  They are deliberately NOT in PLAN or RESERVE: they must never appear in
 *  the swap menu or the "add an exercise" picker. */
export const RETIRED: Record<string, string> = {
  'reverse-lunge': 'Reverse Lunge',
  'hip-thrust': 'Glute Bridge',
  'lateral-lunge': 'Lateral Lunge',
  'plank-a': 'Plank',
  ohp: 'Overhead Press',
  pike: 'Pike Push-up',
  halo: 'Plate Halo',
  'front-raise': 'Plate Front Raise',
  'oh-tri': 'Overhead Triceps Extension',
  'side-plank-a': 'Side Plank',
  rdl: 'Romanian Deadlift',
  bulgarian: 'Bulgarian Split Squat',
  'sl-bridge': 'Single-leg Glute Bridge',
  'sumo-dl': 'Sumo Deadlift',
  curtsy: 'Curtsy Lunge',
  'inv-row': 'Inverted Row',
  'sa-row': 'Single-arm Bent-over Row',
  pullover: 'Plate Pullover',
  'plate-curl': 'Plate Curl',
  'russian-twist': 'Plate Russian Twist',
  'reverse-plank': 'Reverse Plank',
  superman: 'Superman',
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

/** Resolve an exercise id: the live plan first, then the reserve pool, then —
 *  as a last resort — a retired movement from the old home program, so old
 *  logs and PRs still render with a real name instead of disappearing. */
export function exerciseById(id: string): Exercise | null {
  for (const d of PLAN) {
    const e = d.ex.find((x) => x.id === id);
    if (e) return e;
  }
  const r = RESERVE.find((x) => x.id === id);
  if (r) return r;
  const name = RETIRED[id];
  if (name) {
    return { id, name, sets: 0, reps: '', load: 'Retired from the current gym program.', video: '', retired: true };
  }
  return null;
}

/** A move is "timed" when its prescription is a hold/duration (planks, wall
 *  sits, interval rounds) rather than a rep count — detected from words like
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

/** YouTube search URL for an exercise with no saved demo — DayView offers it
 *  as a one-tap link so a missing video is ten seconds of work to fix. */
export function videoSearchUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} proper form`)}`;
}
