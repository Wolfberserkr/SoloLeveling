// The "Reset" 4-day GYM program — machine-based fat-loss training for a fully
// equipped commercial gym. Plan, warm-up, cool-down, week tips, injury flags,
// swap suggestions, and finish messages. Pure data; no DOM.
//
// Design brief this file implements:
//   • Mon / Tue / Thu / Fri strength · Wed / Sat mobility · Sun full rest.
//   • Goal is fat loss: 10–20 rep work, 45–60 sec rest, paired supersets for
//     density, and an interval-conditioning slot on the two upper days —
//     while every session still carries real, progressive resistance work so
//     the weight she loses is fat and not muscle.
//   • Everything runs on machines/cables (fixed path, easy to load, easy to
//     re-find week to week). Free weights only where no machine does the job:
//     the barbell squat finisher, the Smith-bar hinge, a couple of dumbbell
//     reserves.
//   • Every strength day ENDS on a squat, alternating across the week:
//     Mon back squat (heavy) → Tue front squat (light/technique) →
//     Thu back squat (heaviest) → Fri front squat (light/technique).
//     Squatting 4×/week only works if two of the four are deliberately light,
//     hence the "technique day" load cues on Tue/Fri.

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
  /** Estimated door-to-door session length in minutes — warm-up, working
   *  sets, rest, station changes, cool-down and a contingency buffer.
   *  See the TIME BUDGET block below for the arithmetic. Hard cap: 60. */
  estMin?: number;
};

// ── TIME BUDGET ──────────────────────────────────────────────────────────────
// Every strength session has to fit inside one hour including warm-up and
// cool-down, so the set counts below are not a vibe — they are costed.
//
// Cost model (deliberately pessimistic — a real gym, not a stopwatch fantasy):
//   work set ............ 45 s   (10–15 controlled reps)
//   straight-set rest ... 60 s
//   superset round ...... 45 s A1 + 15 s transfer + 45 s A2, 60 s rest after
//   squat-finisher rest .. 90 s (75 s on the light technique days)
//   station change ...... 60 s  (90 s to claim TWO stations for a superset,
//                                120 s for the rack: walk over, load, one
//                                empty-bar ramp set)
//   warm-up ............. 360 s (6 min — see WARMUP)
//   cool-down ........... 300 s (5 min — see COOLDOWN)
//   contingency ......... 300 s (5 min: a busy machine, water, logging sets)
//
// MONDAY — Lower A                                                  seconds
//   warm-up ................................................. 360
//   Leg Press 4 sets ......... 60 + 4×45 + 3×60 ............... 420
//   SS A  Leg Curl + Leg Ext, 3 rounds
//                            .. 90 + 3×(45+15+45) + 2×60 ....... 525
//   SS B  Hip Thrust + Abduction, 3 rounds ................... 525
//   Standing Calf Raise 3 sets  60 + 3×45 + 2×45 .............. 285
//   Back Squat 3 sets ........ 120 + 3×45 + 2×90 .............. 435
//   cool-down 300 + contingency 300 .......................... 600
//   TOTAL 3150 s = 52.5 min → estMin 53                        ✔ < 60
//
// TUESDAY — Upper A
//   360 + 420 (Chest Press 4) + 525 (SS Shoulder Press+Pec Deck)
//   + 525 (SS Pushdown+Rear Delt) + 465 (intervals: 60 + 5×45 + 4×45)
//   + 405 (Front Squat: 120 + 3×45 + 2×75) + 600
//   TOTAL 3300 s = 55 min → estMin 55                          ✔ < 60
//
// THURSDAY — Lower B
//   360 + 420 (Lying Leg Curl 4) + 525 (SS Smith RDL+Adduction)
//   + 525 (SS Hack Squat+Calf) + 285 (Ab Crunch 3)
//   + 570 (Back Squat: 120 + 4×45 + 3×90) + 600
//   TOTAL 3285 s = 54.75 min → estMin 55                       ✔ < 60
//
// FRIDAY — Upper B
//   360 + 420 (Lat Pulldown 4) + 525 (SS Cable Row+Assisted Pull-up)
//   + 555 (SS Curl+Woodchop — woodchop runs 55 s, it's per side)
//   + 465 (intervals) + 405 (Front Squat) + 600
//   TOTAL 3330 s = 55.5 min → estMin 56                        ✔ < 60
//
// WED / SAT — Mobility
//   rope 5×(45+20 rest) = 305 · 7 moves × (2×40 + 20 change) = 700
//   + cool-down 300 + contingency 180
//   TOTAL 1485 s = 24.75 min → estMin 25 (the optional lymphatic-drainage
//   flow adds ~8 min on top if she wants it)
//
// If a session is running long the order of sacrifice is: contingency → the
// last accessory (calf raise / ab crunch) → a set off the supersets. The
// squat finisher and the first main machine never get cut.
// ─────────────────────────────────────────────────────────────────────────────

/** Gym warm-up for the four strength days — 6 min, done before anything else.
 *  (The old at-home lymphatic-drainage video doesn't fit a gym floor; it now
 *  lives on the mobility and rest days, where it still makes sense.) */
export const WARMUP = [
  '5 min easy cardio — treadmill on a slight incline, bike or rower · finish warm and breathing, not tired',
  'Leg swings — 10 front-to-back + 10 side-to-side each leg',
  'Bodyweight squat to full depth — 10 slow reps',
  'Cable or band face pull / shoulder pass-through — 15 reps',
  "First machine of the day: 1 ramp set of 10 at half your working weight — that's your last form check",
];

/** Lymphatic-drainage flow — kept from the home program. Shown on the mobility
 *  days and the rest day, where a floor-based recovery flow actually fits. */
export const LYMPH_VIDEO = 'https://youtu.be/hFteQ6JXoN0?si=U_flnlnERvn9dGHN';

export const COOLDOWN = [
  '2 min easy walk or spin — bring the heart rate down before you leave the floor',
  'Standing forward fold — 30 sec, breathe into the hamstrings',
  'Figure-4 glute stretch on the mat — 30 sec each side',
  'Rack or doorway chest stretch — 30 sec each side',
  "Child's pose — 45 sec, slow nasal breathing",
];

// Mobility & shadow-jump-rope days (Wed / Sat) — a shared conditioning + joint-
// prep flow. Built as real exercises (sets, reps/time, a demo video per move)
// so these days log and track exactly like the strength days. Exercise ids are
// suffixed per day so Wednesday and Saturday keep independent set progress and
// rep logs (the log map is keyed by exercise id across the whole program).
function shadowJumpDay(sfx: string): Exercise[] {
  return [
    { id: `jump-rope-${sfx}`,  name: 'Shadow Jump Rope',         sets: 5, reps: '45 sec',         load: 'No rope · light bounce · rest 20 sec between rounds', video: 'https://youtu.be/Fdw--dqQAzA' },
    { id: `ankle-circ-${sfx}`, name: 'Ankle Circles',            sets: 2, reps: '20 / side',      load: 'Slow, controlled circles both directions',           video: 'https://youtu.be/om1IAdzpKsg' },
    { id: `hip-circ-${sfx}`,   name: 'Hip Circles',              sets: 2, reps: '20 / direction', load: 'Hands on hips · big smooth circles',                 video: 'https://youtu.be/JYqLwajOGjI' },
    { id: `cat-cow-${sfx}`,    name: 'Cat–Cow',                  sets: 2, reps: '10 reps',        load: 'Spine · move slowly with the breath',                video: 'https://youtu.be/vuyUwtHl694' },
    { id: `t-rot-${sfx}`,      name: 'Thoracic Rotations',       sets: 2, reps: '8 / side',       load: 'Quadruped · open the mid-back',                      video: 'https://youtu.be/z2zv526I7M8' },
    { id: `wgs-${sfx}`,        name: "World's Greatest Stretch", sets: 2, reps: '4 / side',       load: 'Full-body mobility flow',                            video: 'https://youtu.be/-CiWQ2IvY34' },
    { id: `hip-9090-${sfx}`,   name: '90/90 Hip Switches',       sets: 2, reps: '10 total',       load: 'Tall chest · rotate the hips slowly',                video: 'https://youtu.be/wnFTIPhNySI' },
    { id: `squat-hold-${sfx}`, name: 'Deep Squat Hold',          sets: 2, reps: '45 sec',         load: 'Sink low · pry the knees out',                       video: 'https://youtu.be/0wzrgyAurT8' },
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
// NOTE ON VIDEOS: brand-new machine movements ship with video: '' on purpose.
// A guessed YouTube id is a dead embed, which is worse than none — DayView
// offers a one-tap "Search YouTube" link plus a paste-and-save field, so she
// can attach a demo in ten seconds at the machine. Only URLs already verified
// in the home program are carried over.
export const PLAN: Day[] = [
  { id: 'lower-a', name: 'Lower A', focus: 'Legs & glutes · back-squat finisher', dow: 'Monday', kind: 'strength', estMin: 53, ex: [
    { id: 'leg-press',       name: 'Leg Press',            sets: 4, reps: '12–15 reps',  load: 'Feet mid-platform, hip-width · lower to 90°, no lumbar tuck · 2 reps in reserve, last set all-out · rest 60 sec', video: '' },
    { id: 'leg-curl-seated', name: 'Seated Leg Curl',      sets: 3, reps: '12–15 reps',  load: 'SUPERSET A1 · knee joint on the machine pivot · 2-sec lower, no swinging',                                        video: '' },
    { id: 'leg-extension',   name: 'Leg Extension',        sets: 3, reps: '12–15 reps',  load: 'SUPERSET A2 · 1-sec squeeze at the top · rest 45–60 sec after the pair, then straight back to A1',                video: '' },
    { id: 'glute-drive',     name: 'Hip Thrust Machine',   sets: 3, reps: '12–15 reps',  load: 'SUPERSET B1 · pad low on the hips · drive through the heels, 1-sec squeeze at lockout',                            video: '' },
    { id: 'hip-abduction',   name: 'Hip Abduction Machine', sets: 3, reps: '15–20 reps', load: 'SUPERSET B2 · lean the torso slightly forward · slow return, never let the stack clang · rest 45–60 sec',          video: '' },
    { id: 'calf-standing',   name: 'Standing Calf Raise',  sets: 3, reps: '15–20 reps',  load: 'Full stretch at the bottom, 1-sec hold at the top · rest 45 sec',                                                  video: '' },
    { id: 'back-squat-mon',  name: 'Barbell Back Squat',   sets: 3, reps: '8 reps',      load: 'FINISHER · heavy day: bar on the rear delts, brace before every rep, stop 2 reps short of failure · rest 90 sec',  video: '' },
  ]},
  { id: 'upper-a', name: 'Upper A', focus: 'Push, shoulders & intervals', dow: 'Tuesday', kind: 'strength', estMin: 55, ex: [
    { id: 'chest-press',      name: 'Chest Press Machine',    sets: 4, reps: '10–12 reps', load: 'Handles level with mid-chest · press without slamming the elbows straight · last set close to failure · rest 60 sec', video: '' },
    { id: 'shoulder-press',   name: 'Shoulder Press Machine', sets: 3, reps: '10–12 reps', load: 'SUPERSET A1 · seat high enough that the handles start at ear level · ribs down',                                       video: '' },
    { id: 'pec-deck',         name: 'Pec Deck',               sets: 3, reps: '12–15 reps', load: 'SUPERSET A2 · soft elbows, 1-sec squeeze · rest 60 sec after the pair',                                                video: '' },
    { id: 'tri-pushdown',     name: 'Cable Triceps Pushdown', sets: 3, reps: '12–15 reps', load: 'SUPERSET B1 · ROPE, neutral grip — kinder on the elbow than a straight bar · elbows pinned to the ribs',              video: '' },
    { id: 'rear-delt-fly',    name: 'Rear-Delt Fly Machine',  sets: 3, reps: '15–20 reps', load: 'SUPERSET B2 · light · lead with the elbows, pause at the back · rest 60 sec after the pair',                           video: '' },
    { id: 'stair-intervals',  name: 'Stair Climber Intervals', sets: 5, reps: '45 sec',    load: 'CONDITIONING · 45 sec brisk / 45 sec easy · effort 7/10 — short sentences only · rower or bike works the same',       video: '' },
    { id: 'front-squat-tue',  name: 'Barbell Front Squat',    sets: 3, reps: '8 reps',     load: 'FINISHER · technique day: light bar, elbows high, 3-sec lower · quality, not a grind · rest 75 sec',                  video: '' },
  ]},
  { id: 'mobility-wed', name: 'Mobility & Shadow Jump Rope', focus: 'Mobility & conditioning', dow: 'Wednesday', kind: 'mobility', estMin: 25, ex: shadowJumpDay('wed') },
  { id: 'lower-b', name: 'Lower B', focus: 'Hinge, posterior chain · back-squat finisher', dow: 'Thursday', kind: 'strength', estMin: 55, ex: [
    { id: 'leg-curl-lying', name: 'Lying Leg Curl',            sets: 4, reps: '10–12 reps', load: 'Hips flat on the pad · 2-sec lower · last set close to failure · rest 60 sec',                                     video: '' },
    { id: 'smith-rdl',      name: 'Smith Machine RDL',         sets: 3, reps: '10–12 reps', load: 'SUPERSET A1 · bar grazing the legs, hips back, flat back · stop at mid-shin, hamstrings do the work',              video: '' },
    { id: 'hip-adduction',  name: 'Hip Adduction Machine',     sets: 3, reps: '15–20 reps', load: 'SUPERSET A2 · controlled squeeze, never bounce out of the stretch · rest 60 sec after the pair',                   video: '' },
    { id: 'hack-squat',     name: 'Hack Squat',                sets: 3, reps: '10–12 reps', load: 'SUPERSET B1 · feet mid-platform · down to parallel, no deeper · back flat on the pad',                             video: '' },
    { id: 'calf-seated',    name: 'Seated Calf Raise',         sets: 3, reps: '15–20 reps', load: 'SUPERSET B2 · 2-sec lower, 1-sec squeeze · rest 60 sec after the pair',                                            video: '' },
    { id: 'ab-crunch',      name: 'Ab Crunch Machine',         sets: 3, reps: '15–20 reps', load: 'Curl the ribs toward the hips — do not just fold at the hip · exhale at the bottom · rest 45 sec',                  video: '' },
    { id: 'back-squat-thu', name: 'Barbell Back Squat',        sets: 4, reps: '6 reps',     load: 'FINISHER · the heaviest squat of the week: brace, sit between the hips, drive the floor away · rest 90 sec',       video: '' },
  ]},
  { id: 'upper-b', name: 'Upper B', focus: 'Pull, arms & intervals', dow: 'Friday', kind: 'strength', estMin: 56, ex: [
    { id: 'lat-pulldown',    name: 'Lat Pulldown',          sets: 4, reps: '10–12 reps', load: 'Neutral / V-handle if the elbow is grumpy · pull to the collarbone, chest tall, no leaning back · rest 60 sec', video: '' },
    { id: 'cable-row',       name: 'Seated Cable Row',      sets: 3, reps: '10–12 reps', load: 'SUPERSET A1 · pull to the belly button, shoulders down and back · 1-sec squeeze',                                video: '' },
    { id: 'assisted-pullup', name: 'Assisted Pull-up',      sets: 3, reps: '6–8 reps',   load: 'SUPERSET A2 · set the assist so the last rep is hard but clean · rest 60 sec after the pair',                    video: '' },
    { id: 'cable-curl',      name: 'Cable Biceps Curl',     sets: 3, reps: '12–15 reps', load: 'SUPERSET B1 · rope or EZ attachment, never a straight bar · elbows still at the ribs',                           video: '' },
    { id: 'cable-woodchop',  name: 'Cable Woodchop',        sets: 3, reps: '12 / side',  load: 'SUPERSET B2 · high-to-low · turn from the ribcage, hips square · light · rest 60 sec after the pair',            video: '' },
    { id: 'row-intervals',   name: 'Rowing Machine Intervals', sets: 5, reps: '45 sec',  load: 'CONDITIONING · 45 sec hard / 45 sec easy · legs → hips → arms, in that order · stair climber or bike is fine',   video: '' },
    { id: 'front-squat-fri', name: 'Barbell Front Squat',   sets: 3, reps: '8 reps',     load: 'FINISHER · technique day: light, elbows high, 3-sec lower · cross-arm grip if the front rack hurts · rest 75 sec', video: '' },
  ]},
  { id: 'mobility-sat', name: 'Mobility & Shadow Jump Rope', focus: 'Mobility & conditioning', dow: 'Saturday', kind: 'mobility', estMin: 25, ex: shadowJumpDay('sat') },
  { id: 'rest-sun', name: 'Full Rest Day', focus: 'Recovery', dow: 'Sunday', kind: 'rest', ex: [] },
];

// An 8-week fat-loss progression for machine training: learn the machines and
// record the settings → add load → cut rest and raise density → intervals.
export const WEEK_TIPS: Record<number, [string, string]> = {
  1: ['Weeks 1–2', 'Learn the machines. Set each seat and pin, then <b>log the weight you used</b> — that number is your baseline. Keep 2–3 reps in reserve, rest 60 sec.'],
  3: ['Weeks 3–4', '<b>Add load.</b> Any machine where you hit the top of the rep range on every set goes up one plate next session. Last set of each main machine: close to failure.'],
  5: ['Weeks 5–6', '<b>Cut rest to 45 sec</b> on the supersets and hold the load. Same work in less time — that density is where the fat loss lives.'],
  7: ['Weeks 7–8', '<b>Raise the intervals</b> to 8 rounds of 40 sec hard / 40 sec easy, and add one set to the squat finisher. Then re-test your Week 1 weights.'],
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
  'back-squat-mon':  { type: 'back',  warn: 'Loaded spine. Brace before every rep and never let the lower back round out of the bottom. If it barks, swap to the Smith squat or hack squat.' },
  'back-squat-thu':  { type: 'back',  warn: 'Heaviest squat of the week. Warm up two ramp sets, brace hard, and stop the set the moment the back rounds — leave reps behind, not your spine.' },
  'front-squat-tue': { type: 'back',  warn: 'Front-loaded, but the spine still pays. Keep it light and upright; drop the weight before you lose the torso position.' },
  'front-squat-fri': { type: 'back',  warn: 'Front-loaded, but the spine still pays. Keep it light and upright; drop the weight before you lose the torso position.' },
  'smith-rdl':       { type: 'back',  warn: 'Hinge with a neutral spine only. Stop at mid-shin. If you feel it in the lumbar, shorten the range or swap to the leg curl.' },
  'back-extension':  { type: 'back',  warn: 'Spinal extension under load. Stop at a straight line — never arch past it — and skip it entirely if your lower back is tender.' },
  'cable-woodchop':  { type: 'back',  warn: 'Loaded rotation. Turn from the ribcage with the hips square, keep it light, and stop if the lower back joins in.' },
  'tri-pushdown':    { type: 'elbow', warn: 'Classic tennis-elbow trigger. Rope only, elbows pinned, no locking out hard. Stop if the outer elbow pinches.' },
  'cable-curl':      { type: 'elbow', warn: 'Curl grip loads the lateral elbow. Rope or EZ bar, never straight. Drop the weight before you cheat the rep.' },
  'assisted-pullup': { type: 'elbow', warn: 'Straight-bar hanging can flare the elbow. Use neutral handles and more assist rather than grinding out reps.' },
  'oh-cable-triceps': { type: 'elbow', warn: 'Overhead elbow extension under load. Reduce the range or swap to the pushdown if the tendon complains.' },
  'preacher-machine': { type: 'elbow', warn: 'The pad locks the elbow in one line — great for the biceps, hard on a sore tendon. Light weight, slow lower, stop early.' },
};

export const SWAPS: Record<string, string[]> = {
  // ── Monday · Lower A ──
  'leg-press':       ['hack-squat', 'leg-press-single', 'smith-squat'],
  'leg-curl-seated': ['leg-curl-lying', 'back-extension', 'glute-kickback'],
  'leg-extension':   ['hack-squat', 'leg-press-single', 'goblet-squat'],
  'glute-drive':     ['glute-kickback', 'smith-rdl', 'back-extension'],
  'hip-abduction':   ['hip-adduction', 'glute-kickback', 'fire-hydrants'],
  'calf-standing':   ['calf-seated', 'calf-raises'],
  'back-squat-mon':  ['smith-squat', 'hack-squat', 'goblet-squat'],
  // ── Tuesday · Upper A ──
  'chest-press':     ['incline-press-machine', 'db-flat-press', 'pushup'],
  'shoulder-press':  ['db-shoulder-press', 'cable-lateral-raise', 'incline-press-machine'],
  'pec-deck':        ['cable-fly', 'incline-press-machine', 'pushup'],
  'tri-pushdown':    ['oh-cable-triceps', 'dip-machine', 'pushup'],
  'rear-delt-fly':   ['face-pull', 'cable-lateral-raise', 'machine-row'],
  'stair-intervals': ['treadmill-intervals', 'bike-intervals', 'row-intervals'],
  'front-squat-tue': ['smith-squat', 'goblet-squat', 'hack-squat'],
  // ── Thursday · Lower B ──
  'leg-curl-lying':  ['leg-curl-seated', 'back-extension', 'glute-kickback'],
  'smith-rdl':       ['back-extension', 'glute-drive', 'leg-curl-seated'],
  'hip-adduction':   ['hip-abduction', 'glute-kickback', 'cossack-squat'],
  'hack-squat':      ['leg-press', 'smith-squat', 'goblet-squat'],
  'calf-seated':     ['calf-standing', 'calf-raises'],
  'ab-crunch':       ['cable-crunch', 'plank', 'dead-bug'],
  'back-squat-thu':  ['smith-squat', 'goblet-squat', 'leg-press'],
  // ── Friday · Upper B ──
  'lat-pulldown':    ['machine-row', 'straight-arm-pushdown', 'db-row'],
  'cable-row':       ['machine-row', 'db-row', 'straight-arm-pushdown'],
  'assisted-pullup': ['machine-row', 'straight-arm-pushdown', 'db-row'],
  'cable-curl':      ['hammer-curl', 'preacher-machine', 'db-row'],
  'cable-woodchop':  ['pallof-press', 'cable-crunch', 'side-plank'],
  'row-intervals':   ['bike-intervals', 'treadmill-intervals', 'stair-intervals'],
  'front-squat-fri': ['smith-squat', 'goblet-squat', 'leg-press'],
};

// Reserve pool — alternatives that are NOT shown in any day by default. They
// exist only as swap targets, so a day can be re-shaped when a machine is
// occupied (or a joint is complaining). Resolved via exerciseById like any
// other exercise. Verified demo videos carried over from the home program are
// reused; genuinely new gym movements ship with an empty video (see the note
// above PLAN) and DayView's "Search YouTube" link fills the gap in seconds.
export const RESERVE: Exercise[] = [
  // Squat / leg alternates — the busy-rack answers
  { id: 'smith-squat',        name: 'Smith Machine Squat',    sets: 3, reps: '8–10 reps',   load: 'Rack busy? Feet slightly forward, brace, controlled lower · fixed path is easier on the back',  video: '' },
  { id: 'goblet-squat',       name: 'Goblet Squat',           sets: 3, reps: '10–12 reps',  load: 'Dumbbell or kettlebell at the chest · 3-sec lower · the always-available squat',                 video: 'https://youtu.be/MeIiIdhvXT4' },
  { id: 'leg-press-single',   name: 'Single-leg Leg Press',   sets: 3, reps: '10 / leg',    load: 'Foot centred on the platform · half the load, twice the glute · slow and level hips',           video: '' },
  { id: 'glute-kickback',     name: 'Cable Glute Kickback',   sets: 3, reps: '12–15 / leg', load: 'Ankle strap · push back and up, no arching the lower back',                                      video: '' },
  { id: 'back-extension',     name: '45° Back Extension',     sets: 3, reps: '12–15 reps',  load: 'Bodyweight only · rise to a straight line and stop — do not arch past it',                       video: '' },
  { id: 'wall-sit',           name: 'Wall Sit',               sets: 3, reps: '30–45 sec',   load: 'Thighs parallel · hold a plate on the lap to progress',                                          video: 'https://youtu.be/JaZNYM3zAP0' },
  // Push alternates
  { id: 'incline-press-machine', name: 'Incline Chest Press Machine', sets: 3, reps: '10–12 reps', load: 'Upper-chest bias · handles at collarbone height · 1-sec pause off the chest',             video: '' },
  { id: 'db-flat-press',      name: 'Dumbbell Bench Press',   sets: 3, reps: '10–12 reps',  load: 'When every press machine is taken · elbows ~45°, control the lower',                             video: '' },
  { id: 'cable-fly',          name: 'Cable Chest Fly',        sets: 3, reps: '12–15 reps',  load: 'Soft elbows, hug a barrel · 1-sec squeeze in front of the sternum',                              video: '' },
  { id: 'pushup',             name: 'Push-up',                sets: 3, reps: '8–12 reps',   load: 'Zero-equipment fallback · hands on a bench to scale · body in one line',                         video: 'https://youtu.be/WDIpL0pjun0' },
  { id: 'db-shoulder-press',  name: 'Dumbbell Shoulder Press', sets: 3, reps: '10–12 reps', load: 'Seated with back support · ribs down, press to just short of lockout',                           video: '' },
  { id: 'cable-lateral-raise', name: 'Cable Lateral Raise',   sets: 3, reps: '12–15 / side', load: 'Light · lead with the elbow to shoulder height, no shrugging',                                  video: '' },
  { id: 'face-pull',          name: 'Cable Face Pull',        sets: 3, reps: '15–20 reps',  load: 'Rope at eye height · pull to the forehead, thumbs back · great posture work',                    video: '' },
  { id: 'oh-cable-triceps',   name: 'Overhead Cable Triceps Extension', sets: 3, reps: '12–15 reps', load: 'Rope, facing away · elbows high and still · stop short of a hard lockout',               video: '' },
  { id: 'dip-machine',        name: 'Assisted Dip Machine',   sets: 3, reps: '8–12 reps',   load: 'Torso upright for triceps · set the assist so the last rep is hard but clean',                    video: '' },
  // Pull alternates
  { id: 'machine-row',        name: 'Chest-Supported Row Machine', sets: 3, reps: '10–12 reps', load: 'Chest on the pad — takes the lower back out entirely · squeeze the shoulder blades',         video: '' },
  { id: 'db-row',             name: 'Single-arm Dumbbell Row', sets: 3, reps: '10 / arm',   load: 'Brace a hand on the bench · flat back, pull to the hip',                                         video: 'https://youtu.be/pYcpY20QaE8' },
  { id: 'straight-arm-pushdown', name: 'Straight-arm Pulldown', sets: 3, reps: '12–15 reps', load: 'Rope, soft elbows · lats only, no elbow bend · light',                                          video: '' },
  { id: 'hammer-curl',        name: 'Dumbbell Hammer Curl',   sets: 3, reps: '12 / arm',    load: 'Neutral grip — the most elbow-friendly curl there is · no swinging',                             video: '' },
  { id: 'preacher-machine',   name: 'Machine Preacher Curl',  sets: 3, reps: '12–15 reps',  load: 'Armpits on the pad · light, slow lower, stop before the elbow complains',                        video: '' },
  // Core alternates
  { id: 'cable-crunch',       name: 'Cable Crunch',           sets: 3, reps: '15–20 reps',  load: 'Kneeling, rope at the ears · curl the ribs down, hips stay put',                                 video: '' },
  { id: 'pallof-press',       name: 'Pallof Press',           sets: 3, reps: '10 / side',   load: 'Anti-rotation · press the handle straight out and resist the twist',                             video: '' },
  { id: 'plank',              name: 'Plank',                  sets: 3, reps: '30–45 sec',   load: 'Squeeze glutes, ribs down · quality over minutes',                                               video: 'https://youtu.be/mH5Sfb_KTGg' },
  { id: 'side-plank',         name: 'Side Plank',             sets: 3, reps: '30 sec / side', load: 'Stack the hips, lift them high',                                                               video: 'https://youtu.be/44ND4bOB-T0' },
  { id: 'hollow',             name: 'Hollow Hold',            sets: 3, reps: '20–30 sec',   load: 'Lower back glued to the floor — shorten the legs if it lifts',                                   video: 'https://youtu.be/TNHSgs_orU0' },
  { id: 'dead-bug',           name: 'Dead Bug',               sets: 3, reps: '10 / side',   load: 'Slow tempo · ribs down, exhale as the leg lowers',                                               video: 'https://youtu.be/bxn9FBrt4-A' },
  { id: 'bird-dog',           name: 'Bird Dog',               sets: 3, reps: '10 / side',   load: 'Pause each rep · hips level, no rotation',                                                       video: 'https://youtu.be/ZdAHe9_HeEw' },
  // Conditioning alternates
  { id: 'treadmill-intervals', name: 'Treadmill Intervals',   sets: 5, reps: '45 sec',      load: '45 sec brisk incline walk or jog / 45 sec easy · effort 7/10',                                   video: '' },
  { id: 'bike-intervals',     name: 'Bike Intervals',         sets: 5, reps: '45 sec',      load: '45 sec hard / 45 sec spin · the joint-friendliest interval option',                              video: '' },
  // Mobility / bodyweight reserve — carried over from the home program
  { id: 'high-knees',        name: 'High Knees',        sets: 5, reps: '45 sec',    load: 'Drive knees to hip height · fast, light feet',  video: 'https://youtu.be/D0GwAezTvtg' },
  { id: 'jumping-jacks',     name: 'Jumping Jacks',     sets: 5, reps: '45 sec',    load: 'Full range · soft, quiet landings',             video: 'https://youtu.be/7L-5wpilwv4' },
  { id: 'mountain-climbers', name: 'Mountain Climbers', sets: 5, reps: '45 sec',    load: 'Plank · brace the core · quick knee drive',     video: 'https://youtu.be/hq_0YlyfqGM' },
  { id: 'calf-raises',       name: 'Calf Raises',       sets: 2, reps: '15 reps',   load: 'Bodyweight on a step · full range, slow',       video: 'https://youtu.be/k8ipHzKeAkQ' },
  { id: 'ankle-rockers',     name: 'Ankle Rockers',     sets: 2, reps: '10 / side', load: 'Half-kneel · knee over toe, heel down',         video: 'https://youtu.be/Hm_Iu72bJJg' },
  { id: 'leg-swings',        name: 'Leg Swings',        sets: 2, reps: '12 / side', load: 'Front-to-back · relaxed, controlled swing',     video: 'https://youtu.be/0XvKtEZ4i38' },
  { id: 'fire-hydrants',     name: 'Fire Hydrants',     sets: 2, reps: '12 / side', load: 'Quadruped · lift the knee out, hips square',    video: 'https://youtu.be/1zjVNfeKvyI' },
  { id: 'thread-needle',     name: 'Thread the Needle', sets: 2, reps: '8 / side',  load: 'Quadruped · reach an arm under, rotate',        video: 'https://youtu.be/MfUx9FCOb1E' },
  { id: 'open-book',         name: 'Open Book',         sets: 2, reps: '8 / side',  load: 'Side-lying · open the top arm and follow it',   video: 'https://youtu.be/rDviWORCWEw' },
  { id: 'cossack-squat',     name: 'Cossack Squat',     sets: 2, reps: '6 / side',  load: 'Shift side to side · heel down, chest tall',    video: 'https://youtu.be/tpczTeSkHz0' },
  { id: 'frog-stretch',      name: 'Frog Stretch',      sets: 2, reps: '30 sec',    load: 'Knees wide · rock the hips back gently',        video: 'https://youtu.be/NHEPdNlHF2c' },
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
  'goblet-squat':          ['smith-squat', 'hack-squat', 'leg-press'],
  'leg-press-single':      ['leg-press', 'hack-squat', 'smith-squat'],
  'glute-kickback':        ['glute-drive', 'hip-abduction', 'back-extension'],
  'back-extension':        ['smith-rdl', 'leg-curl-lying', 'glute-drive'],
  'wall-sit':              ['goblet-squat', 'cossack-squat', 'smith-squat'],
  'incline-press-machine': ['chest-press', 'db-flat-press', 'pec-deck'],
  'db-flat-press':         ['chest-press', 'incline-press-machine', 'pushup'],
  'cable-fly':             ['pec-deck', 'chest-press', 'db-flat-press'],
  'pushup':                ['chest-press', 'incline-press-machine', 'pec-deck'],
  'db-shoulder-press':     ['shoulder-press', 'cable-lateral-raise', 'face-pull'],
  'cable-lateral-raise':   ['shoulder-press', 'db-shoulder-press', 'rear-delt-fly'],
  'face-pull':             ['rear-delt-fly', 'cable-lateral-raise', 'machine-row'],
  'oh-cable-triceps':      ['tri-pushdown', 'dip-machine', 'pushup'],
  'dip-machine':           ['tri-pushdown', 'oh-cable-triceps', 'chest-press'],
  'machine-row':           ['cable-row', 'lat-pulldown', 'db-row'],
  'db-row':                ['cable-row', 'machine-row', 'lat-pulldown'],
  'straight-arm-pushdown': ['lat-pulldown', 'machine-row', 'cable-row'],
  'hammer-curl':           ['cable-curl', 'preacher-machine', 'db-row'],
  'preacher-machine':      ['cable-curl', 'hammer-curl', 'db-row'],
  'cable-crunch':          ['ab-crunch', 'plank', 'hollow'],
  'pallof-press':          ['cable-woodchop', 'side-plank', 'plank'],
  'plank':                 ['dead-bug', 'hollow', 'side-plank'],
  'side-plank':            ['plank', 'pallof-press', 'hollow'],
  'hollow':                ['plank', 'dead-bug', 'bird-dog'],
  'dead-bug':              ['bird-dog', 'plank', 'hollow'],
  'bird-dog':              ['dead-bug', 'plank', 'hollow'],
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
  return RESERVE.find((x) => x.id === id) ?? null;
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
