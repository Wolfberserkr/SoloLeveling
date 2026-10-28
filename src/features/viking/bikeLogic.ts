// Project Viking — the bike plan's rules as pure functions. Like
// vikingLogic.ts nothing here touches React, storage or the clock: `T`
// (today, YYYY-MM-DD) is always passed in (tests/bike.test.ts).
//
//   1. no hard ride within 24 h before Lower A / Lower B
//   2. hard rides per rolling 8 days ≤ the phase's cap
//   3. deload weeks: Z1–Z2 only, max 60 min, no intervals
//   4. the 8-day cycle is a sequence: it advances on done / skip, not weekdays
//   5. H3 sprints are hidden before phase 2
import {
  BENCHMARKS, BIKE_PHASES, CYCLE, DELOAD_MAX_MIN, DELOAD_RULE, HARD_WINDOW_DAYS, RIDES, RIDE_CODES,
  Z2_TARGET, ZONES, type BenchId, type CycleDay, type RideCode, type ZoneId,
} from './bikePlan';
import { SESS, type PhaseKey, type SessionKey } from './vikingData';
import { dn, iso, num, sum, type Flag, type RideDoc, type Viking } from './vikingLogic';

export const isHard = (r: Pick<RideDoc, 'code' | 'type'>) => (r.code ? RIDES[r.code].hard : r.type === 'hard');
const isLower = (sk: SessionKey | null | undefined) => sk === 'LA' || sk === 'LB';

export const cycleDay = (n: number): CycleDay => CYCLE[(((n - 1) % 8) + 8) % 8];
export const dayOfSession = (sk: SessionKey) => CYCLE.find((c) => c.gym === sk)!.day;
export const nextDay = (n: number) => (n % 8) + 1;

/** Ride codes open in a phase (H3 sprints only from phase 2). */
export const codesFor = (ph: PhaseKey): RideCode[] => RIDE_CODES.filter((c) => ph !== '1' || !RIDES[c].fromPhase2);

/** Zone list → "Z2 · 115–135 bpm" (Z1 reads "under 115 bpm"). */
export function zoneLabel(z: ZoneId[]): string {
  const zs = ZONES.filter((x) => z.includes(x.id));
  if (!zs.length) return '';
  const lo = zs[0], hi = zs[zs.length - 1];
  const ids = lo.id === hi.id ? lo.id : `${lo.id}–${hi.id}`;
  return `${ids} · ${lo.min ? `${lo.min}–${hi.max}` : `under ${hi.max + 1}`} bpm`;
}

/** m:ss for benchmark times. */
export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
/** "20:46" / "1246" → seconds. NaN when unreadable. */
export function parseTime(s: string): number {
  const t = s.trim();
  if (!t) return NaN;
  if (t.includes(':')) {
    const p = t.split(':').map((x) => num(x));
    if (p.some((x) => !Number.isFinite(x) || x < 0)) return NaN;
    return p.reduce((a, x) => a * 60 + x, 0);
  }
  return num(t);
}

export type Rx = {
  code: RideCode;
  /** Set when the deload swapped a hard/long ride for an easy one. */
  from?: RideCode;
  min: [number, number];
  detail: string;
  zones: ZoneId[];
};

/** What a ride should look like this week: the plan's progression, and the
 *  deload rule swapping intervals for easy Z2. */
export function prescribe(code: RideCode, wk: number, ph: PhaseKey, deload: boolean): Rx {
  const R = RIDES[code];
  if (deload && (R.hard || code === 'L1')) {
    return { code: 'E1', from: code, min: [DELOAD_MAX_MIN, DELOAD_MAX_MIN], zones: ['Z1', 'Z2'], detail: `Deload: ${DELOAD_RULE}` };
  }
  let min: [number, number] = [...R.min];
  let detail = R.how;
  if (code === 'E1') {
    if (ph === '1') {
      // 60 → 90 min across the 12 foundation weeks, in 5-min steps
      const m = 60 + Math.round(((Math.min(Math.max(wk, 1), 12) - 1) / 11) * 6) * 5;
      min = [m, m];
    } else min = [90, 90];
  }
  if (code === 'H1') {
    const climbs = ph === '1' ? Math.min(6, 4 + Math.floor((Math.max(wk, 1) - 1) / 2)) : null;
    detail = climbs
      ? `15 min Z2 warm-up. ${climbs} × 3 min climbs in Z4, easy back down 3–4 min. 10 min cool-down.`
      : '15 min Z2 warm-up. 5–6 × 4 min climbs in Z4, easy back down 3–4 min. 10 min cool-down.';
  }
  if (deload) min = [Math.min(min[0], DELOAD_MAX_MIN), Math.min(min[1], DELOAD_MAX_MIN)];
  return { code, min, detail, zones: deload ? R.zones.filter((z) => z === 'Z1' || z === 'Z2') : R.zones };
}

/** Ride options for a cycle day in a phase. The diet break adds the L1 long ride on the endurance day. */
export function dayRides(cd: CycleDay, ph: PhaseKey): { codes: RideCode[]; optional: boolean } {
  let codes = ph === '1' && cd.ridePhase1 ? cd.ridePhase1 : cd.ride;
  if (ph === 'B' && cd.day === 6) codes = ['L1', ...codes];
  codes = codes.filter((c) => codesFor(ph).includes(c));
  const optional = !!cd.optional || (ph === '1' && !!cd.optionalPhase1);
  return { codes, optional };
}

/**
 * Everything the bike plan derives from one snapshot of the data. Build it
 * once per render from the `viking(data)` result.
 */
export function bike(v: Viking) {
  const rides = v.sorted('rides');
  const ticks = v.sorted('cycle');
  const W = v.sorted('workouts');
  const capOf = (d: string) => BIKE_PHASES[v.phaseOf(d)].hardCap;

  /** Where the cycle stands: the day after the last tick. With no ticks yet
   *  it lines up behind the last logged gym session. */
  function current(): { day: number; lastDate: string | null } {
    const last = ticks[ticks.length - 1];
    if (last) return { day: nextDay(last.day), lastDate: last.date };
    const lw = W[W.length - 1];
    return { day: lw ? nextDay(dayOfSession(lw.session)) : 1, lastDate: null };
  }

  /** Hard rides in the rolling window ending on day number `end`. */
  const hardIn = (end: number, list: RideDoc[] = rides) =>
    list.filter((r) => isHard(r) && dn(r.date) > end - HARD_WINDOW_DAYS && dn(r.date) <= end).length;

  /** Warnings for one ride, logged or about to be. `pending` = not saved yet. */
  function rideFlags(r: Pick<RideDoc, 'date' | 'code' | 'type' | 'minutes'>, T: string, pending = false): Flag[] {
    const out: Flag[] = [];
    const d = dn(r.date), wk = v.weekOf(r.date), ph = v.phaseOf(r.date), cap = capOf(r.date);
    const hard = isHard(r);
    const deload = v.isDeloadWeek(wk);
    if (deload && hard) out.push({ l: 'warn', t: 'Hard ride in a deload week', b: `Week ${wk} is a deload. ${DELOAD_RULE}` });
    else if (deload && r.minutes > DELOAD_MAX_MIN) out.push({ l: 'warn', t: 'Long for a deload', b: `Keep deload rides to ${DELOAD_MAX_MIN} min or less.` });
    if (hard) {
      const n = hardIn(d) + (pending ? 1 : 0);
      if (n > cap) out.push({ l: 'warn', t: 'Over the hard-ride cap', b: `${n} hard rides in ${HARD_WINDOW_DAYS} days. ${BIKE_PHASES[ph].n} allows ${cap}. Make this an E1 or R1.` });
      // Rule 1: a Lower session logged within 24 h after the ride…
      const lowerAfter = W.find((w) => isLower(w.session) && (dn(w.date) === d || dn(w.date) === d + 1));
      if (lowerAfter) out.push({ l: 'warn', t: 'Hard ride before a Lower day', b: `${SESS[lowerAfter.session].n} was logged within 24 h after this ride. Keep hard rides away from the day before Lower A or Lower B.` });
      // …or, for a ride being logged now, one coming up next in the cycle:
      // today's Lower day itself, or the day after this ride day.
      else if (pending && d >= dn(T) - 1) {
        const cur = cycleDay(current().day), nx = cycleDay(nextDay(cur.day));
        const upcoming = cur.gym ? (isLower(cur.gym) ? cur.gym : null) : isLower(nx.gym) ? nx.gym : null;
        if (upcoming)
          out.push({ l: 'warn', t: 'Lower day next', b: `${SESS[upcoming].n} is next in the cycle. No hard ride within 24 h before it: ride easy (E1/R1) or move the hard ride after it.` });
      }
    }
    return out;
  }

  /** Today's cycle card: the day, its gym session, ride options and warnings. */
  function today(T: string) {
    const t = dn(T), wk = v.weekOf(T), ph = v.phaseOf(T), deload = v.isDeloadWeek(wk);
    const { day } = current();
    const cd = cycleDay(day);
    const { codes, optional } = dayRides(cd, ph);
    const rx = codes.map((c) => prescribe(c, wk, ph, deload));
    const flags: Flag[] = [];
    if (cd.gym && cd.gym !== v.nextSession())
      flags.push({ l: 'info', t: 'Gym rotation differs', b: `The cycle says ${SESS[cd.gym].n}, the logger says ${SESS[v.nextSession()].n} is next. Logging a session lines the cycle back up.` });
    if (rx.some((x) => RIDES[x.code].hard)) {
      const n = hardIn(t) + 1, cap = BIKE_PHASES[ph].hardCap;
      if (n > cap) flags.push({ l: 'warn', t: 'Hard-ride cap reached', b: `${n - 1} hard ride${n - 1 === 1 ? '' : 's'} in the last ${HARD_WINDOW_DAYS} days already (cap ${cap}). Ride E1 or R1 today instead.` });
      const nx = cycleDay(nextDay(day));
      if (isLower(nx.gym)) flags.push({ l: 'warn', t: 'Lower day tomorrow', b: `${SESS[nx.gym!].n} follows this day. Keep today's ride easy.` });
    }
    // "Hard ride in the last 24 h → Lower next" and "max 2 lifting days in a
    // row" already show on the Next session card (TodayTab).
    if (deload) {
      const bad = rides.filter((r) => v.weekOf(r.date) === wk && isHard(r));
      if (bad.length) flags.push({ l: 'warn', t: 'Hard ride logged this deload', b: `${bad.length} hard ride${bad.length === 1 ? '' : 's'} this week. ${DELOAD_RULE}` });
    }
    return { day, cd, wk, ph, deload, rx, optional, flags };
  }

  /** The plan week holding T: Z2 minutes vs target, hard rides vs cap, ride time. */
  function week(T: string) {
    const t = dn(T), wk = v.weekOf(T), ph = v.phaseOf(T);
    const s = dn(v.cfg.startDate) + (wk - 1) * 7;
    const inWk = rides.filter((r) => dn(r.date) >= s && dn(r.date) <= t);
    let est = false;
    const z2 = sum(inWk.map((r) => {
      if (Number.isFinite(num(r.z2))) return num(r.z2);
      const easyZ2 = r.code ? r.code === 'E1' || r.code === 'L1' : r.type === 'easy';
      if (easyZ2) est = true;
      return easyZ2 ? r.minutes || 0 : 0;
    }));
    return {
      wk, start: iso(s), rides: inWk.length, minutes: sum(inWk.map((r) => r.minutes || 0)),
      z2, z2Target: ph === '1' ? Z2_TARGET.phase1 : Z2_TARGET.later, z2Est: est,
      hard: hardIn(t), cap: BIKE_PHASES[ph].hardCap, ridesTarget: BIKE_PHASES[ph].rides,
    };
  }

  /** A benchmark's points, oldest first: the baseline, every retest, and for
   *  cadence the average cadence of each logged E1 ride. */
  function series(id: BenchId): Array<{ date: string; val: number; hr?: number; base?: boolean; id?: string; src: string }> {
    const B = BENCHMARKS.find((b) => b.id === id)!;
    const pts: Array<{ date: string; val: number; hr?: number; base?: boolean; id?: string; src: string }> = [];
    const bv = B.kind === 'time' ? B.base.sec : B.base.rpm;
    if (bv != null) pts.push({ date: B.base.date, val: bv, hr: B.base.hr, base: true, src: 'Baseline' });
    for (const r of v.sorted('benchmarks')) {
      if (r.bench !== id) continue;
      const val = B.kind === 'time' ? r.sec : r.rpm;
      if (val != null && Number.isFinite(val)) pts.push({ date: r.date, val, hr: r.hr, id: r.id, src: r.source === 'strava' ? 'Strava' : 'Retest' });
    }
    if (id === 'cadence')
      for (const r of rides) if (r.code === 'E1' && Number.isFinite(num(r.cadence))) pts.push({ date: r.date, val: num(r.cadence), hr: r.hr, src: 'E1 ride' });
    return pts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  /** At the end of each deload week (its last 3 days, or the first 3 of the
   *  next week) until both timed tests have been retested since it began. */
  function retestDue(T: string): { wk: number } | null {
    const t = dn(T), s0 = dn(v.cfg.startDate);
    if (t < s0) return null;
    const wk = v.weekOf(T), dow = (t - s0) % 7;
    const dlWk = v.isDeloadWeek(wk) && dow >= 4 ? wk : wk > 1 && v.isDeloadWeek(wk - 1) && dow <= 2 ? wk - 1 : null;
    if (!dlWk) return null;
    const from = s0 + (dlWk - 1) * 7;
    const done = (id: BenchId) => v.sorted('benchmarks').some((r) => r.bench === id && dn(r.date) >= from);
    return done('aerobic') && done('climb') ? null : { wk: dlWk };
  }

  return { current, hardIn, rideFlags, today, week, series, retestDue, capOf };
}
export type Bike = ReturnType<typeof bike>;
