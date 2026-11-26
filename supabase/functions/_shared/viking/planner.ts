// Project Viking — cycle settling and the 7-day plan the watch mirrors.
// Pure functions over the logged data: `today` and `savedAt` are passed in.
import { PHASES, SESS, type PhaseKey, type SessionKey } from './data.ts';
import { BIKE_PHASES, RIDES, type RideCode } from './bikePlan.ts';
import { bike, cycleDay, dayOfSession, dayRides, nextDay, prescribe, type Rx } from './bikeLogic.ts';
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
const currentDay = (D: VikingData) => bike(viking(D)).current().day;
const mk = (date: string, day: number, status: CycleDoc['status'], savedAt: number) =>
  ({ id: tickId(date, day), doc: { date, day, status, savedAt } });

/** Tick for a gym session on `date`: the current day when it matches, else
 *  the session's own day (a realign). Null when that tick already exists. */
export function gymTick(
  D: VikingData, date: string, sk: SessionKey, savedAt: number,
): { id: string; doc: CycleDoc; realigned: boolean } | null {
  // With no ticks yet the cycle lines up behind the last workout; the one
  // being ticked (or anything later) isn't history for this decision.
  const hist = ticksOf(D).length ? D
    : { ...D, workouts: Object.fromEntries(Object.entries(D.workouts).filter(([, w]) => w.date < date)) };
  const cur = currentDay(hist);
  const realigned = cycleDay(cur).gym !== sk;
  const t = mk(date, realigned ? dayOfSession(sk) : cur, 'done', savedAt);
  return D.cycle[t.id] ? null : { ...t, realigned };
}

/** Tick for a ride day: ≥ 20 min of rides dated `date` on a no-gym day that
 *  has rides, not before the latest tick and with no tick on that date. */
export function rideTick(D: VikingData, date: string, savedAt: number): { id: string; doc: CycleDoc } | null {
  if (!D.settings) return null;
  const mins = Object.values(D.rides).filter((r) => r.date === date).reduce((a, r) => a + (Number(r.minutes) || 0), 0);
  if (mins < 20 || hasTickOn(D, date)) return null;
  const last = latestTickDate(D);
  if (last != null && date < last) return null;
  const v = viking(D);
  const cur = bike(v).current().day, cd = cycleDay(cur);
  if (cd.gym || !dayRides(cd, v.phaseOf(date)).codes.length) return null;
  const t = mk(date, cur, 'done', savedAt);
  return D.cycle[t.id] ? null : t;
}

/** Settle a finished date. Null: a tick is already dated `date` (or the cycle
 *  has already been ticked past it, so there's nothing to settle). */
export function endOfDay(D: VikingData, date: string, savedAt: number): { id: string; doc: CycleDoc } | 'slid' | null {
  if (hasTickOn(D, date)) return null;
  const last = latestTickDate(D);
  if (last != null && date < last) return null;
  const v = viking(D);
  const cur = bike(v).current().day, cd = cycleDay(cur);
  if (cur === 8) return mk(date, cur, 'done', savedAt);
  if (!cd.gym && dayRides(cd, v.phaseOf(date)).optional) return mk(date, cur, 'skip', savedAt);
  return 'slid';
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

/** The next `days` dates from today (or tomorrow when today already has a
 *  workout or tick), one cycle day each. */
export function planAhead(D: VikingData, ctx: PlanCtx, days = 7): PlanDay[] {
  if (!D.settings) return [];
  const v = viking(D), b = bike(v);
  const logged = v.sorted('rides');
  const cur = b.current().day;
  const todayBusy = Object.values(D.workouts).some((w) => w.date === ctx.today) || hasTickOn(D, ctx.today);

  const out: PlanDay[] = [];
  /** Rides planned so far, as ride docs for the window and cap checks. */
  const planned: RideDoc[] = [];
  const addPlanned = (p: PlanDay) => {
    if (p.ride) planned.push({ date: p.date, code: p.ride.code, type: RIDES[p.ride.code].hard ? 'hard' : 'easy', minutes: p.ride.minutes });
  };

  let t = dn(ctx.today) + (todayBusy ? 1 : 0);
  let n = cur;
  const fz = ctx.frozen;
  if (fz && fz.date === ctx.today && !todayBusy && fz.day.cycleDay === cur) {
    out.push(fz.day);
    addPlanned(fz.day);
    t++;
    n = nextDay(fz.day.cycleDay);
  }

  // Phase B day 6: L1 until one is ridden (or planned) since the break began.
  const breakStart = v.cfg.phaseMode === 'auto' ? dn(v.cfg.startDate) + 26 * 7 : dn(v.cfg.startDate);

  for (; out.length < days; t++, n = nextDay(n)) {
    const date = iso(t), cd = cycleDay(n);
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
      const nx = cycleDay(nextDay(n)).gym;
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
