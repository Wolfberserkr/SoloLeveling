// Project Viking — Garmin workout builders. Pure: no Node, Deno or DOM APIs.
import { SESS } from './data.ts';
import type { SessionKey, PhaseKey } from './data.ts';
import type { Rx } from './bikeLogic.ts';

export type GarminEx = { category: string; exerciseName?: string };
const g = (category: string, exerciseName?: string): GarminEx => (exerciseName ? { category, exerciseName } : { category });

export const GARMIN_EX: Record<string, GarminEx | null> = {
  // Upper A
  bench: g('BENCH_PRESS', 'BARBELL_BENCH_PRESS'),
  csrow: g('ROW'),
  dbsp: g('SHOULDER_PRESS', 'SEATED_DUMBBELL_SHOULDER_PRESS'),
  pulldown: g('PULL_UP', 'LAT_PULLDOWN'),
  incdb: g('BENCH_PRESS', 'INCLINE_DUMBBELL_BENCH_PRESS'),
  clat: g('LATERAL_RAISE', 'ONE_ARM_CABLE_LATERAL_RAISE'),
  ezcurl: g('CURL', 'STANDING_EZ_BAR_BICEPS_CURL'),
  pushdown: g('TRICEPS_EXTENSION', 'TRICEPS_PRESSDOWN'),
  // Lower A
  squat: g('SQUAT', 'BARBELL_BACK_SQUAT'),
  rdl: g('DEADLIFT', 'ROMANIAN_DEADLIFT'),
  legpress: g('SQUAT', 'LEG_PRESS'),
  lycurl: g('LEG_CURL', 'LEG_CURL'),
  stcalf: g('CALF_RAISE', 'STANDING_CALF_RAISE'),
  crunch: g('CRUNCH', 'CABLE_CRUNCH'),
  farmer: g('CARRY', 'FARMERS_CARRY'),
  // Upper B
  incbb: g('BENCH_PRESS', 'INCLINE_BARBELL_BENCH_PRESS'),
  pullup: g('PULL_UP', 'PULL_UP'),
  mpress: g('SHOULDER_PRESS'),
  scrow: g('ROW', 'SEATED_CABLE_ROW'),
  pecdeck: g('FLYE', 'CABLE_CROSSOVER'),
  dblat: g('LATERAL_RAISE', 'DUMBBELL_LATERAL_RAISE'),
  revpec: null,
  incurl: g('CURL', 'INCLINE_DUMBBELL_BICEPS_CURL'),
  ohext: g('TRICEPS_EXTENSION', 'CABLE_OVERHEAD_TRICEPS_EXTENSION'),
  shrug: g('SHRUG', 'DUMBBELL_SHRUG'),
  // Lower B
  trapdl: g('DEADLIFT', 'TRAP_BAR_DEADLIFT'),
  bss: g('LUNGE', 'DUMBBELL_BULGARIAN_SPLIT_SQUAT'),
  legext: null,
  securl: g('LEG_CURL', 'LEG_CURL'),
  secalf: g('CALF_RAISE', 'SEATED_CALF_RAISE'),
  hkr: g('LEG_RAISE', 'HANGING_KNEE_RAISE'),
  abwheel: g('CORE', 'KNEELING_AB_WHEEL'),
};

export type StrengthTarget = { kg: number | null; assistKg?: number | null; reps: number; sets: number; note: string };
export type GarminDto = Record<string, unknown>;

export function restSeconds(rest: string): number {
  if (/superset/i.test(rest)) return 15;
  const nums = (rest.match(/\d+/g) ?? []).map(Number);
  if (!nums.length) return 60;
  if (/min/i.test(rest)) {
    const m = rest.match(/(\d+)\s*[–-]\s*(\d+)\s*min/);
    if (m) return Math.round(((Number(m[1]) + Number(m[2])) / 2) * 60);
    return nums[0] * 60;
  }
  return nums[0];
}

const END_TIME = { conditionTypeId: 2, conditionTypeKey: 'time' };
const NO_TARGET = { workoutTargetTypeId: 1, workoutTargetTypeKey: 'no.target' };
const HR_TARGET = { workoutTargetTypeId: 4, workoutTargetTypeKey: 'heart.rate.zone' };

const walk = (steps: any[], f: (s: any) => void) => { for (const s of steps) { f(s); if (s.workoutSteps) walk(s.workoutSteps, f); } };

export function buildStrengthWorkout(sk: SessionKey, t: Record<string, StrengthTarget>, name: string, description: string): GarminDto {
  let order = 0;
  const steps = SESS[sk].ex.map((ex) => {
    const tg = t[ex.k] ?? { kg: null, reps: ex.r[0], sets: ex.s, note: '' };
    const gx = GARMIN_EX[ex.k] ?? null;
    const isM = ex.u === 'm';
    const kg = tg.kg != null && tg.kg > 0 ? tg.kg : null;
    let desc = ex.n;
    if (tg.assistKg != null && tg.assistKg < 0) desc += ` · assist ${Math.abs(tg.assistKg)} kg`;
    if (tg.note) desc += ` · ${tg.note}`;
    if (isM) desc += ` · ${tg.reps} m`;
    const stepOrder = ++order;
    const exStep = {
      type: 'ExecutableStepDTO',
      stepOrder: order + 1,
      stepType: { stepTypeId: 3, stepTypeKey: 'interval' },
      description: desc,
      endCondition: isM ? { conditionTypeId: 1, conditionTypeKey: 'lap.button' } : { conditionTypeId: 10, conditionTypeKey: 'reps' },
      endConditionValue: isM ? null : tg.reps,
      category: gx?.category ?? null,
      exerciseName: gx?.exerciseName ?? null,
      weightValue: kg,
      weightUnit: kg != null ? { unitId: 8, unitKey: 'kilogram', factor: 1000 } : null,
    };
    order++;
    const restStep = {
      type: 'ExecutableStepDTO',
      stepOrder: order + 1,
      stepType: { stepTypeId: 5, stepTypeKey: 'rest' },
      endCondition: END_TIME,
      endConditionValue: restSeconds(ex.rest),
    };
    order++;
    return {
      type: 'RepeatGroupDTO',
      stepOrder,
      stepType: { stepTypeId: 6, stepTypeKey: 'repeat' },
      numberOfIterations: tg.sets,
      endCondition: { conditionTypeId: 7, conditionTypeKey: 'iterations' },
      endConditionValue: tg.sets,
      smartRepeat: false,
      workoutSteps: [exStep, restStep],
    };
  });
  return {
    workoutName: name,
    description,
    sportType: { sportTypeId: 5, sportTypeKey: 'strength_training' },
    workoutSegments: [{ segmentOrder: 1, sportType: { sportTypeId: 5, sportTypeKey: 'strength_training' }, workoutSteps: steps }],
  };
}

type Band = [number, number];
const Z: Record<string, Band> = { Z1: [90, 114], Z2: [115, 135], Z3: [136, 150], Z4: [151, 167], Z5: [168, 186] };
const WIDE: Band = [90, 135];

export function buildRideWorkout(rx: Rx, week: number, phase: PhaseKey, name: string, description: string): GarminDto {
  let order = 0;
  const kinds: Record<string, [number, string]> = { warmup: [1, 'warmup'], cooldown: [2, 'cooldown'], interval: [3, 'interval'], recovery: [4, 'recovery'] };
  const step = (kind: string, sec: number, band: Band | null) => {
    const [id, key] = kinds[kind];
    return {
      type: 'ExecutableStepDTO',
      stepOrder: ++order,
      stepType: { stepTypeId: id, stepTypeKey: key },
      endCondition: END_TIME,
      endConditionValue: sec,
      ...(band
        ? { targetType: HR_TARGET, targetValueOne: band[0], targetValueTwo: band[1] }
        : { targetType: NO_TARGET, targetValueOne: null, targetValueTwo: null }),
    };
  };
  const repeat = (n: number, build: () => any[]) => {
    const stepOrder = ++order;
    return {
      type: 'RepeatGroupDTO',
      stepOrder,
      stepType: { stepTypeId: 6, stepTypeKey: 'repeat' },
      numberOfIterations: n,
      endCondition: { conditionTypeId: 7, conditionTypeKey: 'iterations' },
      endConditionValue: n,
      smartRepeat: false,
      workoutSteps: build(),
    };
  };
  const m = (x: number) => x * 60;
  let steps: any[];
  switch (rx.code) {
    case 'E1':
      steps = [step('interval', m(rx.min[0]), rx.zones.includes('Z1') ? WIDE : Z.Z2)];
      break;
    case 'R1':
      steps = [step('interval', m(30), Z.Z1)];
      break;
    case 'H1': {
      const n = phase === '1' ? Math.min(6, 4 + Math.floor((week - 1) / 2)) : 5;
      const hard = phase === '1' ? m(3) : m(4);
      steps = [
        step('warmup', m(15), Z.Z2),
        repeat(n, () => [step('interval', hard, Z.Z4), step('recovery', 210, WIDE)]),
        step('cooldown', m(10), Z.Z2),
      ];
      break;
    }
    case 'H2':
      steps = [step('warmup', m(10), Z.Z2), step('interval', m(45), null), step('cooldown', m(5), Z.Z1)];
      break;
    case 'H3':
      steps = [
        step('warmup', m(15), Z.Z2),
        repeat(10, () => [step('interval', 30, Z.Z5), step('recovery', 150, Z.Z1)]),
        step('cooldown', m(5), Z.Z1),
      ];
      break;
    case 'L1':
      steps = [step('interval', m(120), Z.Z2)];
      break;
    default:
      throw new Error(`unknown ride code ${String((rx as Rx).code)}`);
  }
  return {
    workoutName: name,
    description,
    sportType: { sportTypeId: 2, sportTypeKey: 'cycling' },
    workoutSegments: [{ segmentOrder: 1, sportType: { sportTypeId: 2, sportTypeKey: 'cycling' }, workoutSteps: steps }],
  };
}

export function dtoMinutes(dto: GarminDto): number {
  let sec = 0;
  const go = (steps: any[], mult: number) => {
    for (const s of steps) {
      if (s.workoutSteps) go(s.workoutSteps, mult * (s.numberOfIterations ?? 1));
      else if (s.endCondition?.conditionTypeKey === 'time') sec += (s.endConditionValue ?? 0) * mult;
    }
  };
  for (const seg of (dto.workoutSegments as any[]) ?? []) {
    if (dto.sportType && (dto.sportType as any).sportTypeKey === 'strength_training') return 0;
    go(seg.workoutSteps, 1);
  }
  return Math.ceil(sec / 60);
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function garminDate(date: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return `${DAYS[dt.getUTCDay()]} ${d} ${MONTHS[mo - 1]}`;
}

export const workoutName = (label: string, date: string): string => `Viking ${label} (${garminDate(date)})`;

const sortKeys = (x: unknown): unknown =>
  Array.isArray(x) ? x.map(sortKeys)
    : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, sortKeys((x as any)[k])]))
    : x;

export function hashOf(x: unknown): string {
  const s = JSON.stringify(sortKeys(x)) ?? 'null';
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function withMarker(dto: GarminDto): { dto: GarminDto; hash: string } {
  const hash = hashOf({ ...dto, description: null });
  return { dto: { ...dto, description: `${dto.description ?? ''} [viking:${hash}]` }, hash };
}
