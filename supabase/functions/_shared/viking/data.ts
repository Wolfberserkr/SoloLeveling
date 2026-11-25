// Project Viking — the 52-week plan as pure data. Session and exercise keys
// are frozen: saved workouts and lift history key off them.

export type PhaseKey = '1' | '2' | 'B' | '3' | '4';
export type Phase = { n: string; kcal: number; cut: boolean; c: string };

export const PHASES: Record<PhaseKey, Phase> = {
  '1': { n: 'Foundation cut', kcal: 2100, cut: true, c: '--p1' },
  '2': { n: 'Main cut', kcal: 2100, cut: true, c: '--p2' },
  B: { n: 'Diet break', kcal: 2600, cut: false, c: '--pb' },
  '3': { n: 'Finish cut', kcal: 2050, cut: true, c: '--p3' },
  '4': { n: 'Lean build', kcal: 2850, cut: false, c: '--p4' },
};
export const PHASE_KEYS: PhaseKey[] = ['1', '2', 'B', '3', '4'];

/** Phase by plan week when following the calendar. */
export const autoPhase = (w: number): PhaseKey =>
  w <= 12 ? '1' : w <= 26 ? '2' : w <= 28 ? 'B' : w <= 38 ? '3' : '4';

export const PROTEIN = 190;

export type SessionKey = 'UA' | 'LA' | 'UB' | 'LB';
export const ORDER: SessionKey[] = ['UA', 'LA', 'UB', 'LB'];

export type IncKey = 'bbU' | 'bbL' | 'mU' | 'mL' | 'db' | 'iso' | 'pull' | 'bw';
export const INC: Record<IncKey, string> = {
  bbU: '+2.5 kg', bbL: '+5 kg', mU: '+2.5 kg', mL: '+5 kg', db: '+1–2 kg', iso: '+1–2 kg',
  pull: '2.5 kg less assist', bw: 'add reps or slow the tempo',
};
export const STEP: Record<IncKey, number> = {
  bbU: 2.5, bbL: 5, mU: 2.5, mL: 5, db: 2, iso: 1, pull: 2.5, bw: 0,
};

export type Exercise = {
  k: string;
  n: string;
  /** Base set count. */
  s: number;
  /** Rep range [low, high]. */
  r: [number, number];
  /** Unit label for the reps column (default "reps"). */
  u?: string;
  rest: string;
  inc: IncKey;
  /** Accessory type: these get extra volume in later phases. */
  t?: 'row' | 'lat' | 'arm';
  /** A main lift — watched by the coach for strength trends. */
  main?: boolean;
  note?: string;
};
export type Session = { n: string; sub: string; upper?: boolean; ex: Exercise[] };

export const SESS: Record<SessionKey, Session> = {
  UA: { n: 'Upper A', sub: 'Strength · chest & back', upper: true, ex: [
    { k: 'bench', n: 'Barbell bench press', s: 3, r: [5, 8], rest: '2–3 min', inc: 'bbU', main: true, note: 'Shoulder blades pinned, feet planted.' },
    { k: 'csrow', n: 'Chest-supported row', s: 3, r: [6, 10], rest: '2 min', inc: 'mU', t: 'row', main: true, note: 'Elbows to hips, pause 1 sec.' },
    { k: 'dbsp', n: 'Seated DB shoulder press', s: 3, r: [8, 10], rest: '2 min', inc: 'db' },
    { k: 'pulldown', n: 'Lat pulldown', s: 3, r: [8, 12], rest: '90 s', inc: 'mU', note: 'Back width, the V-taper.' },
    { k: 'incdb', n: 'Incline dumbbell press', s: 2, r: [10, 12], rest: '90 s', inc: 'db' },
    { k: 'clat', n: 'Cable lateral raise', s: 3, r: [12, 15], rest: '60 s', inc: 'iso', t: 'lat', note: 'Strict, no swinging.' },
    { k: 'ezcurl', n: 'EZ-bar curl', s: 2, r: [8, 12], rest: 'superset', inc: 'iso', t: 'arm', note: 'Superset with the rope pushdown.' },
    { k: 'pushdown', n: 'Rope pushdown', s: 2, r: [8, 12], rest: '60 s after pair', inc: 'iso', t: 'arm' },
  ] },
  LA: { n: 'Lower A', sub: 'Squat focus + core', ex: [
    { k: 'squat', n: 'Back squat / hack squat', s: 3, r: [5, 8], rest: '2–3 min', inc: 'bbL', main: true, note: 'Depth you control.' },
    { k: 'rdl', n: 'Romanian deadlift', s: 3, r: [8, 10], rest: '2 min', inc: 'bbL', main: true, note: 'Bar slides down thighs, flat back.' },
    { k: 'legpress', n: 'Leg press', s: 2, r: [10, 12], rest: '2 min', inc: 'mL' },
    { k: 'lycurl', n: 'Lying leg curl', s: 3, r: [10, 12], rest: '90 s', inc: 'iso' },
    { k: 'stcalf', n: 'Standing calf raise', s: 3, r: [10, 15], rest: '60 s', inc: 'mL', note: 'Full stretch, 1 sec pause.' },
    { k: 'crunch', n: 'Cable crunch', s: 3, r: [10, 15], rest: '60 s', inc: 'iso', note: "Round the spine, don't pull with the arms." },
    { k: 'farmer', n: "Farmer's carry", s: 3, r: [30, 40], u: 'm', rest: '90 s', inc: 'db', note: 'kg per hand, metres walked.' },
  ] },
  UB: { n: 'Upper B', sub: 'Size · shoulders, arms, traps', upper: true, ex: [
    { k: 'incbb', n: 'Incline barbell / Smith press', s: 3, r: [8, 10], rest: '2 min', inc: 'bbU', main: true },
    { k: 'pullup', n: 'Pull-up (assisted is fine)', s: 3, r: [6, 10], rest: '2 min', inc: 'pull', main: true, note: 'Enter machine assist as negative kg, e.g. −20.' },
    { k: 'mpress', n: 'Machine shoulder press', s: 3, r: [10, 12], rest: '90 s', inc: 'mU' },
    { k: 'scrow', n: 'Seated cable row', s: 3, r: [10, 12], rest: '90 s', inc: 'mU', t: 'row' },
    { k: 'pecdeck', n: 'Pec deck / cable fly', s: 2, r: [12, 15], rest: '60 s', inc: 'iso' },
    { k: 'dblat', n: 'Dumbbell lateral raise', s: 3, r: [12, 20], rest: '60 s', inc: 'iso', t: 'lat' },
    { k: 'revpec', n: 'Reverse pec deck', s: 2, r: [15, 15], rest: '60 s', inc: 'iso' },
    { k: 'incurl', n: 'Incline dumbbell curl', s: 3, r: [10, 12], rest: '60 s', inc: 'iso', t: 'arm' },
    { k: 'ohext', n: 'Overhead cable triceps ext.', s: 3, r: [10, 12], rest: '60 s', inc: 'iso', t: 'arm' },
    { k: 'shrug', n: 'Dumbbell shrug', s: 3, r: [10, 15], rest: '60 s', inc: 'db', note: '1 sec squeeze at the top.' },
  ] },
  LB: { n: 'Lower B', sub: 'Hinge focus + core', ex: [
    { k: 'trapdl', n: 'Trap-bar deadlift', s: 3, r: [5, 8], rest: '2–3 min', inc: 'bbL', main: true, note: 'Keep 2 reps in the tank.' },
    { k: 'bss', n: 'Bulgarian split squat', s: 3, r: [8, 10], u: 'reps/leg', rest: '90 s', inc: 'db', note: 'kg per dumbbell.' },
    { k: 'legext', n: 'Leg extension', s: 2, r: [12, 15], rest: '60 s', inc: 'iso' },
    { k: 'securl', n: 'Seated leg curl', s: 2, r: [10, 15], rest: '60 s', inc: 'iso' },
    { k: 'secalf', n: 'Seated calf raise', s: 3, r: [12, 15], rest: '60 s', inc: 'mL' },
    { k: 'hkr', n: 'Hanging knee raise', s: 3, r: [10, 15], rest: '60 s', inc: 'bw', note: 'Slow, no swinging. Leave kg at 0.' },
    { k: 'abwheel', n: 'Ab wheel rollout / plank', s: 3, r: [8, 12], u: 'reps or s', rest: '60 s', inc: 'bw', note: 'Plank: enter seconds (45 s target).' },
  ] },
};

export const EXBY: Record<string, Exercise & { sess: SessionKey }> = {};
for (const sk of ORDER) for (const e of SESS[sk].ex) EXBY[e.k] = { ...e, sess: sk };

export type PlanItem = { k: string; n: string; sub: string; kcal: number; p: number };
export const PLAN_ITEMS: PlanItem[] = [
  { k: 'm1', n: 'Meal 1', sub: 'Your portion of the prepped lunch', kcal: 700, p: 60 },
  { k: 'shake', n: 'Protein shake', sub: '1.5 scoops whey + 250 ml skim milk', kcal: 280, p: 45 },
  { k: 'm2', n: 'Meal 2', sub: 'Your portion of the prepped dinner', kcal: 700, p: 60 },
  { k: 'bowl', n: 'Yogurt bowl', sub: '250 g skyr, fruit, 20 g oats, 15 g PB', kcal: 420, p: 32 },
];

export const SUPPS: Array<[string, string]> = [
  ['creatine', 'Creatine 5 g'], ['d3', 'Vitamin D3'], ['omega', 'Omega-3'], ['multi', 'Multivitamin'],
  ['psyllium', 'Psyllium'], ['mag', 'Magnesium'], ['electro', 'Electrolytes'],
];

export type Checkpoint = { wk: number; n: string; lo: number; hi: number; see: string };
export const CPS: Checkpoint[] = [
  { wk: 13, n: 'Month 3', lo: 95, hi: 97, see: 'Waist clearly down, all lifts up, technique solid' },
  { wk: 26, n: 'Month 6', lo: 90, hi: 92, see: 'Shoulders and arms bigger relative to waist' },
  { wk: 39, n: 'Month 9', lo: 86, hi: 88, see: 'Upper abs outline, visible shoulder separation' },
  { wk: 52, n: 'Month 12', lo: 86, hi: 90, see: 'Lean build under way, fuller and harder look' },
];
