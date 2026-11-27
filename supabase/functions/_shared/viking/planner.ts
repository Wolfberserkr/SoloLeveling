// Project Viking — cycle settling and the 7-day plan the watch mirrors.
// Pure functions over the logged data: `today` and `savedAt` are passed in.
import { PHASES, SESS, type PhaseKey, type SessionKey } from './data.ts';
import { BIKE_PHASES, RIDES, type RideCode } from './bikePlan.ts';
import { bike, cycleDay, dayOfSession, dayRides, isHard, prescribe, type Box, type Rx } from './bikeLogic.ts';
import { dn, iso, viking, type CycleDoc, type RideDoc, type VikingData } from './logic.ts';
import { nextTargets, type Overrides, type Progress, type Resets } from './targets.ts';
import { buildRideWorkout, buildStrengthWorkout, withMarker, workoutName, type GarminDto } from './garmin.ts';

export type Health = { hrvStatus?: string; readiness?: number; sleepH?: number; bodyBattery?: number; sleepStress?: number };

export type PlanDay = {
  date: string;
  cycleDay: number;
  kind: 'gym' | 'ride' | 'rest';
  session?: SessionKey;
  targets?: Record<string, Progress>;
  ride?: { code: RideCode; from?: RideCode; minutes: number; reason?: string };
  garmin?: { name: string; sport: 'strength_training' | 'cycling'; dto: GarminDto; hash: string };
  reason?: string;
};

export type PlanCurrent = {
  builtAt: string; date: string; week: number; phase: PhaseKey; deload: boolean; cycleDay: number;
  hash: string; days: PlanDay[]; suggestions: unknown[];
};

export type PlanCtx = {
  today: string;
  /** Local dates on which a confirmed shift ends between 00:00 and 08:00. */
  afterNight: Set<string>;
  /** date → train_window */
  windows?: Record<string, string>;
  health?: Health;
  overrides: Overrides;
  resets: Resets;
  frozen?: { date: string; day: PlanDay };
  /** date → box the owner moved there (0 = an extra day off). */
  pins?: Pins;
};

/** The swapped ride's length cap. */
const SWAP_MAX_MIN = 60;
/** "In the last 8 days" for the H1/H2 and H3/H2 alternation, inclusive. */
const ALT_WINDOW = 8;

export const tickId = (date: string, day: number): string => `${date}_auto_${day}`;

const ticksOf = (D: VikingData) => Object.values(D.cycle);
const latestTickDate = (D: VikingData): string | null =>
  ticksOf(D).reduce<string | null>((m, t) => (m == null || t.date > m ? t.date : m), null);
const hasTickOn = (D: VikingData, date: string) => ticksOf(D).some((t) => t.date === date);
const mk = (date: string, day: number, status: CycleDoc['status'], savedAt: number) =>
  ({ id: tickId(date, day), doc: { date, day, status, savedAt } });

/** date → cycle day 1–8, or 0 for an extra day off. */
export type Pins = Record<string, number>;

/** Total minutes of the rides dated `date`. */
const rideMinutes = (D: VikingData, date: string) =>
  Object.values(D.rides).filter((r) => r.date === date).reduce((a, r) => a + (Number(r.minutes) || 0), 0);

/** Ride-first swap threshold: the shortest planned ride that isn't optional. */
const SWAP_RIDE_MIN = 45;

/** Tick for a gym session on `date`: the session's own box. `early` lists the
 *  open boxes before it (none when the date is pinned to it); `newLap` is set
 *  when that box was already filled. Null when that tick already exists. */
export function gymTick(
  D: VikingData, date: string, sk: SessionKey, savedAt: number, pins: Pins = {},
): { id: string; doc: CycleDoc; early: number[]; newLap: boolean } | null {
  // With no ticks yet the cycle lines up behind the last workout; the one
  // being ticked (or anything later) isn't history for this decision.
  const hist = ticksOf(D).length ? D
    : { ...D, workouts: Object.fromEntries(Object.entries(D.workouts).filter(([, w]) => w.date < date)) };
  const day = dayOfSession(sk);
  const t = mk(date, day, 'done', savedAt);
  if (D.cycle[t.id]) return null;
  // The first tick opens the lap: days before it are passed, so it is a new
  // lap when it isn't where the last workout left the cycle.
  if (!ticksOf(hist).length) return { ...t, early: [], newLap: bike(viking(hist)).current().day !== day };
  const boxes = bike(viking(hist)).lap().boxes;
  const newLap = boxes[day - 1].status !== 'open';
  const early = newLap || pins[date] === day ? [] : boxes.filter((b) => b.day < day && b.status === 'open').map((b) => b.day);
  return { ...t, early, newLap };
}

/** Tick for a ride day: ≥ 20 min of rides dated `date`, not before the latest
 *  tick and with no tick on that date. Fills the date's pinned box when it is
 *  an open ride box, else the first open box when that is a ride day. On a
 *  gym day it waits for `endOfDay` (a ride-first swap). */
export function rideTick(D: VikingData, date: string, savedAt: number, pins: Pins = {}): { id: string; doc: CycleDoc } | null {
  if (!D.settings) return null;
  if (rideMinutes(D, date) < 20 || hasTickOn(D, date)) return null;
  const last = latestTickDate(D);
  if (last != null && date < last) return null;
  const v = viking(D), b = bike(v), ph = v.phaseOf(date);
  const isRideBox = (n: number) => { const cd = cycleDay(n); return !cd.gym && dayRides(cd, ph).codes.length > 0; };
  const pin = pins[date];
  const pinned = pin >= 1 && pin <= 8 && b.lap().boxes[pin - 1].status === 'open' && isRideBox(pin);
  const day = pinned ? pin : b.current().day;
  if (!isRideBox(day)) return null;
  const t = mk(date, day, 'done', savedAt);
  return D.cycle[t.id] ? null : t;
}

/** Settle a finished date. Null: a tick is already dated `date` (or the cycle
 *  has already been ticked past it, so there's nothing to settle).
 *  `'off'`: the date is an extra day off. `'wait'`: a ride-first swap that
 *  needs Garmin to have delivered the date first. */
export function endOfDay(
  D: VikingData, date: string, savedAt: number, o: { pins?: Pins; delivered?: boolean } = {},
): { id: string; doc: CycleDoc; early?: number[] } | 'slid' | 'off' | 'wait' | null {
  if (hasTickOn(D, date)) return null;
  const last = latestTickDate(D);
  if (last != null && date < last) return null;
  const pins = o.pins ?? {}, delivered = o.delivered ?? true;
  if (pins[date] === 0) return 'off';
  const v = viking(D), b = bike(v), ph = v.phaseOf(date);
  const boxes = b.lap().boxes;
  const cur = b.current().day, cd = cycleDay(cur);

  const swap = cd.gym && !Object.values(D.workouts).some((w) => w.date === date) && rideMinutes(D, date) >= SWAP_RIDE_MIN
    ? rideSwapBox(D, v, b, date, ph) : null;
  if (swap) {
    if (!delivered) return 'wait';
    const t = mk(date, swap, 'done', savedAt);
    return D.cycle[t.id] ? null : { ...t, early: [cur] };
  }

  const pin = pins[date];
  const day = pin >= 1 && pin <= 8 && boxes[pin - 1].status === 'open' ? pin : cur, pcd = cycleDay(day);
  if (day === 8) return mk(date, day, 'done', savedAt);
  if (!pcd.gym && dayRides(pcd, ph).optional) return mk(date, day, 'skip', savedAt);
  return 'slid';
}

/** The open ride box a ride-first swap on `date` fills, or null (an extra).
 *  Hard ride → the first open hard-ride box. Easy ride → box 6, else the
 *  first open hard box in a deload week or at the hard-ride cap. */
function rideSwapBox(D: VikingData, v: ReturnType<typeof viking>, b: ReturnType<typeof bike>, date: string, ph: PhaseKey): number | null {
  const open = b.lap().boxes.filter((x) => x.status === 'open').map((x) => x.day);
  const rideBox = (n: number) => { const cd = cycleDay(n), r = dayRides(cd, ph); return !cd.gym && !r.optional && r.codes.length > 0 ? r : null; };
  const hardBox = open.find((n) => rideBox(n)?.codes.some((c) => RIDES[c].hard)) ?? null;
  const rode = Object.values(D.rides).filter((r) => r.date === date);
  if (rode.some((r) => isHard(r))) return hardBox;
  if (open.includes(6) && rideBox(6)) return 6;
  const wk = v.weekOf(date);
  return v.isDeloadWeek(wk) || b.hardIn(dn(date)) >= BIKE_PHASES[ph].hardCap ? hardBox : null;
}

/** First matching readiness flag, as the swap reason. */
function readinessWhy(h: Health | undefined): string | null {
  if (!h) return null;
  const hrv = h.hrvStatus?.toUpperCase();
  if (hrv === 'LOW' || hrv === 'UNBALANCED') return `readiness: HRV ${hrv}`;
  if (h.readiness != null && h.readiness < 40) return `readiness ${h.readiness}`;
  if (h.sleepH != null && h.sleepH < 6) return `readiness: sleep ${h.sleepH} h`;
  if (h.bodyBattery != null && h.bodyBattery < 30) return `readiness: body battery ${h.bodyBattery}`;
  if (h.sleepStress != null && h.sleepStress >= 30) return `readiness: sleep stress ${h.sleepStress}`;
  return null;
}

const BOX_NAMES = ['UA', 'LA', 'Ride', 'UB', 'LB', 'E1', 'Ride', 'Rest'];
const dayLabel = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
};

/** The first planned date: today, or tomorrow when today already has a
 *  workout or tick. */
const planStart = (D: VikingData, today: string) =>
  dn(today) + (Object.values(D.workouts).some((w) => w.date === today) || hasTickOn(D, today) ? 1 : 0);

/** One planned date: `day` 0 is a day off, or (with `free`) a date on which
 *  every open box is pinned to a later date. */
export type PlanSlot = { date: string; day: number; free?: { day: number; date: string } };

/** The frozen day is kept only when no pin moves its box: not a different box
 *  onto today, and not its own box to another date. */
function freezeKept(D: VikingData, ctx: PlanCtx): boolean {
  const fz = ctx.frozen;
  if (!fz || fz.date !== ctx.today || !D.settings) return false;
  const busy = Object.values(D.workouts).some((w) => w.date === ctx.today) || hasTickOn(D, ctx.today);
  if (busy || fz.day.cycleDay !== bike(viking(D)).current().day) return false;
  const pins = ctx.pins ?? {};
  return (!pins[ctx.today] || pins[ctx.today] === fz.day.cycleDay)
    && !Object.entries(pins).some(([d, p]) => d !== ctx.today && p === fz.day.cycleDay);
}

/** Which box each of the next `days` dates places, simulated on a copy of the
 *  lap (`day` 0 = a day off). A pin whose box is open and not yet placed
 *  places it on its date; any other date places the first open box not pinned
 *  to a later date in the window. A full lap rolls over to a fresh one. */
export function planOrder(D: VikingData, ctx: PlanCtx, days = 7): PlanSlot[] {
  if (!D.settings) return [];
  const b = bike(viking(D)), pins = ctx.pins ?? {};
  const t0 = planStart(D, ctx.today);
  const fresh = (): Box[] => Array.from({ length: 8 }, (_, i) => ({ day: i + 1, status: 'open' as const }));
  let boxes: Box[] = b.lap().boxes.map((x) => ({ ...x }));
  // With no ticks the cycle lines up behind the last workout: earlier boxes are behind us.
  if (!ticksOf(D).length) boxes = boxes.map((x) => (x.day < b.current().day ? { ...x, status: 'passed' as const } : x));
  const dates = Array.from({ length: days }, (_, i) => iso(t0 + i));
  const out: PlanSlot[] = [];
  const kept = freezeKept(D, ctx);
  dates.forEach((date, i) => {
    if (kept && i === 0) {
      const day = ctx.frozen!.day.cycleDay;
      boxes[day - 1] = { day, status: 'done', date };
      out.push({ date, day });
      return;
    }
    if (pins[date] === 0) { out.push({ date, day: 0 }); return; }
    if (!boxes.some((x) => x.status === 'open')) boxes = fresh();
    const open = boxes.filter((x) => x.status === 'open').map((x) => x.day);
    const pin = pins[date];
    const later = new Set(dates.slice(i + 1).map((d) => pins[d]).filter((p) => p >= 1 && p <= 8));
    const day = pin >= 1 && pin <= 8 && open.includes(pin) ? pin : open.find((n) => !later.has(n));
    if (day == null) {
      const d = dates.slice(i + 1).find((x) => open.includes(pins[x]))!;
      out.push({ date, day: 0, free: { day: pins[d], date: d } });
      return;
    }
    boxes[day - 1] = { day, status: 'done', date };
    out.push({ date, day });
  });
  return out;
}

/** The next `days` dates from today (or tomorrow when today already has a
 *  workout or tick), one planned box each (see `planOrder`). */
export function planAhead(D: VikingData, ctx: PlanCtx, days = 7): PlanDay[] {
  if (!D.settings) return [];
  const v = viking(D), b = bike(v);
  const logged = v.sorted('rides');
  const order = planOrder(D, ctx, days);

  const out: PlanDay[] = [];
  /** Rides planned so far, as ride docs for the window and cap checks. */
  const planned: RideDoc[] = [];
  const addPlanned = (p: PlanDay) => {
    if (p.ride) planned.push({ date: p.date, code: p.ride.code, type: RIDES[p.ride.code].hard ? 'hard' : 'easy', minutes: p.ride.minutes });
  };

  let first = 0;
  const fz = ctx.frozen;
  if (fz && freezeKept(D, ctx)) {
    out.push(fz.day);
    addPlanned(fz.day);
    first = 1;
  }

  // Phase B day 6: L1 until one is ridden (or planned) since the break began.
  const breakStart = v.cfg.phaseMode === 'auto' ? dn(v.cfg.startDate) + 26 * 7 : dn(v.cfg.startDate);

  for (let i = first; i < order.length; i++) {
    const { date, day: n, free } = order[i], t = dn(date);
    if (free) {
      const cd = cycleDay(free.day), nm = cd.gym ? SESS[cd.gym].n : BOX_NAMES[free.day - 1];
      out.push({ date, cycleDay: 0, kind: 'rest', reason: `free day: ${nm} is pinned to ${dayLabel(free.date)}` });
      continue;
    }
    if (n === 0) { out.push({ date, cycleDay: 0, kind: 'rest', reason: 'day off' }); continue; }
    const cd = cycleDay(n);
    const wk = v.weekOf(date), ph = v.phaseOf(date), deload = v.isDeloadWeek(wk);
    const base = `Project Viking week ${wk} · ${PHASES[ph].n}`;
    const desc = (reason?: string) =>
      base + (reason ? `. ${reason}` : '') + (ctx.windows?.[date] ? `. Train ${ctx.windows[date]}` : '');

    if (cd.gym) {
      const sk = cd.gym;
      const targets = nextTargets(v, sk, date, ctx.overrides, ctx.resets);
      const name = workoutName(SESS[sk].n + (deload ? ' · deload' : ''), date);
      const m = withMarker(buildStrengthWorkout(sk, targets, name, desc()));
      out.push({ date, cycleDay: n, kind: 'gym', session: sk, targets, garmin: { name, sport: 'strength_training', dto: m.dto, hash: m.hash } });
      continue;
    }

    const { codes, optional } = dayRides(cd, ph);
    if (!codes.length || optional) { out.push({ date, cycleDay: n, kind: 'rest' }); continue; }

    const all = [...logged, ...planned];
    const inAlt = (c: RideCode) => all.some((r) => r.code === c && dn(r.date) >= t - ALT_WINDOW && dn(r.date) <= t);
    let code: RideCode = codes[0];
    if (cd.day === 3) code = inAlt('H1') ? 'H2' : 'H1';
    else if (cd.day === 7) code = inAlt('H3') ? 'H2' : 'H3';
    else if (codes.includes('L1'))
      code = all.some((r) => r.code === 'L1' && dn(r.date) >= breakStart && dn(r.date) <= t) ? 'E1' : 'L1';

    // Swaps, in order. Deload is prescribe's own rule (hard or L1 → E1 60).
    let reason: string | undefined;
    let rx: Rx = prescribe(code, wk, ph, deload);
    if (rx.from) reason = 'deload week';
    else {
      const hard = RIDES[code].hard, heavy = hard || code === 'L1';
      const cap = BIKE_PHASES[ph].hardCap;
      const nHard = hard ? b.hardIn(t, all) : 0;
      const nd = i + 1 < order.length ? order[i + 1].day : b.after(n);
      const nx = nd ? cycleDay(nd).gym : null;
      if (hard && nHard + 1 > cap) reason = `hard-ride cap: ${nHard} in the last 8 days (${BIKE_PHASES[ph].n} allows ${cap})`;
      else if (hard && (nx === 'LA' || nx === 'LB')) reason = `${SESS[nx].n} tomorrow`;
      else if (heavy && ctx.afterNight.has(date)) reason = 'after a night shift';
      else if (heavy && date === ctx.today) reason = readinessWhy(ctx.health) ?? undefined;
      if (reason) {
        const e = prescribe('E1', wk, ph, deload);
        rx = { ...e, from: code, min: [Math.min(SWAP_MAX_MIN, e.min[0]), Math.min(SWAP_MAX_MIN, e.min[1])] };
      }
    }
    // A planned E1 straight after a night shift keeps its code but is capped.
    if (!reason && rx.code === 'E1' && ctx.afterNight.has(date) && rx.min[0] > SWAP_MAX_MIN) {
      reason = 'after a night shift';
      rx = { ...rx, min: [Math.min(SWAP_MAX_MIN, rx.min[0]), Math.min(SWAP_MAX_MIN, rx.min[1])] };
    }

    const minutes = rx.min[0];
    const name = workoutName(`${rx.code} · ${RIDES[rx.code].n} ${minutes} min`, date);
    const m = withMarker(buildRideWorkout(rx, wk, ph, name, desc(reason)));
    const day: PlanDay = {
      date, cycleDay: n, kind: 'ride',
      ride: { code: rx.code, ...(rx.from ? { from: rx.from } : {}), minutes, ...(reason ? { reason } : {}) },
      garmin: { name, sport: 'cycling', dto: m.dto, hash: m.hash },
      ...(reason ? { reason } : {}),
    };
    out.push(day);
    addPlanned(day);
  }
  return out;
}
