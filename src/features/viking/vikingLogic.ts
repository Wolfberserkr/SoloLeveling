// Project Viking — the plan's rules as pure functions over the logged data.
// Nothing here touches React, storage or the clock: `today` is always passed
// in, so every rule is unit-testable (tests/viking.test.ts).
import {
  CPS, EXBY, INC, ORDER, PHASES, PLAN_ITEMS, PROTEIN, SESS, STEP, autoPhase,
  type Exercise, type PhaseKey, type SessionKey,
} from './vikingData';

// ── Documents ────────────────────────────────────────────────────────────────
export type Settings = {
  startDate: string;
  startWeight: number;
  phaseMode: 'auto' | PhaseKey;
  kcalAdjust: number;
  /** Day the calorie adjustment last changed — the coach waits 14 days
   *  before suggesting another one. */
  adjDate?: string;
};
export type WeightDoc = { date: string; kg: number };
export type WaistDoc = { date: string; cm: number };
export type NutritionDoc = {
  date: string;
  items?: Record<string, boolean>;
  extraKcal?: number;
  extraProtein?: number;
  water?: number;
};
export type RecoveryDoc = { date: string; sleep?: number; steps?: number; supps?: Record<string, boolean> };
export type SetEntry = { kg: number; reps: number };
export type WorkoutDoc = {
  date: string;
  session: SessionKey;
  week: number;
  phase: PhaseKey;
  deload: boolean;
  entries: Array<{ ex: string; sets: SetEntry[] }>;
  savedAt: number;
};
export type RideDoc = { date: string; type: 'easy' | 'hard'; minutes: number; hr?: number; savedAt?: number };

export type Coll = 'weights' | 'waist' | 'nutrition' | 'recovery' | 'workouts' | 'rides';
export const COLLS: Coll[] = ['weights', 'waist', 'nutrition', 'recovery', 'workouts', 'rides'];
export type DocOf = {
  weights: WeightDoc; waist: WaistDoc; nutrition: NutritionDoc;
  recovery: RecoveryDoc; workouts: WorkoutDoc; rides: RideDoc;
};
export type VikingData = { settings: Settings | null } & { [C in Coll]: Record<string, DocOf[C]> };

export function emptyData(): VikingData {
  return { settings: null, weights: {}, waist: {}, nutrition: {}, recovery: {}, workouts: {}, rides: {} };
}

// ── Dates (local YYYY-MM-DD, day numbers since the epoch) ───────────────────
const pad = (n: number) => String(n).padStart(2, '0');
export const todayISO = (d: Date = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dn = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 864e5);
};
export const iso = (n: number) => {
  const d = new Date(n * 864e5);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtD = (s: string) => { const [, m, d] = s.split('-').map(Number); return `${d} ${MON[m - 1]}`; };
export const fmtDY = (s: string) => { const [y, m, d] = s.split('-').map(Number); return `${d} ${MON[m - 1]} ${y}`; };

// ── Numbers ──────────────────────────────────────────────────────────────────
/** Lenient parse: accepts "101,4" and a typographic minus. NaN when blank. */
export const num = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return NaN;
  return parseFloat(String(v).replace(',', '.').replace('−', '-'));
};
export const k1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
export const thou = (v: number) => Math.round(v).toLocaleString('en-US');
export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/** Strength score of one set: Epley-style e1RM, or reps for bodyweight work. */
export const score = (s: { kg: unknown; reps: unknown }) => {
  const kg = num(s.kg) || 0, r = num(s.reps) || 0;
  return kg > 0 ? kg * (1 + r / 30) : r + kg / 2.5;
};
export const best = (sets: SetEntry[]): number | null => (sets.length ? Math.max(...sets.map(score)) : null);

export function defaultSettings(today: string): Settings {
  return { startDate: today, startWeight: 102, phaseMode: 'auto', kcalAdjust: 0 };
}

// ── Coach flags ──────────────────────────────────────────────────────────────
export type FlagLevel = 'act' | 'warn' | 'info' | 'good';
export type Flag = { l: FlagLevel; t: string; b: string; adj?: number; al?: string };

export type Hint = { c: 'good' | 'warn' | 'info'; t: string; kg: number | '' };

/**
 * Everything derived from one snapshot of the data. Build it once per render
 * (`useMemo(() => viking(data), [data])`) and read the rules off it.
 */
export function viking(D: VikingData) {
  const cfg: Settings = { ...defaultSettings(todayISO()), ...(D.settings ?? {}) };

  const sortedCache = new Map<Coll, unknown[]>();
  function sorted<C extends Coll>(cn: C): Array<DocOf[C] & { id: string }> {
    const hit = sortedCache.get(cn);
    if (hit) return hit as Array<DocOf[C] & { id: string }>;
    const out = Object.entries(D[cn])
      .map(([id, v]) => ({ id, ...(v as DocOf[C]) }))
      .sort((a, b) =>
        a.date < b.date ? -1 : a.date > b.date ? 1
          : ((a as { savedAt?: number }).savedAt ?? 0) - ((b as { savedAt?: number }).savedAt ?? 0));
    sortedCache.set(cn, out);
    return out;
  }

  // Lift history: exercise key → every logged session's sets, oldest first.
  const H: Record<string, Array<{ date: string; sets: SetEntry[] }>> = {};
  for (const w of sorted('workouts'))
    for (const e of w.entries ?? []) (H[e.ex] ??= []).push({ date: w.date, sets: e.sets ?? [] });

  const weekOf = (d: string) => Math.max(1, Math.floor((dn(d) - dn(cfg.startDate)) / 7) + 1);
  const phaseOf = (d: string): PhaseKey => {
    const m = cfg.phaseMode;
    return m && m !== 'auto' && PHASES[m] ? m : autoPhase(weekOf(d));
  };
  const isDeloadWeek = (wk: number) => wk % 6 === 0;

  /** 7-day average weight ending on day number `end` — needs 3+ weigh-ins. */
  function avg7(end: number): number | null {
    const v: number[] = [];
    for (let d = end - 6; d <= end; d++) {
      const w = D.weights[iso(d)];
      if (w && Number.isFinite(w.kg)) v.push(w.kg);
    }
    return v.length >= 3 ? sum(v) / v.length : null;
  }

  function nutTotals(d: string): { kcal: number; p: number; water: number } | null {
    const doc = D.nutrition[d];
    if (!doc) return null;
    let kcal = 0, p = 0;
    for (const it of PLAN_ITEMS) if (doc.items?.[it.k]) { kcal += it.kcal; p += it.p; }
    kcal += num(doc.extraKcal) || 0;
    p += num(doc.extraProtein) || 0;
    return { kcal, p, water: num(doc.water) };
  }

  const longRide = (d: string) => sorted('rides').some((r) => r.date === d && r.minutes >= 90);
  const kcalTarget = (d: string) =>
    PHASES[phaseOf(d)].kcal + (num(cfg.kcalAdjust) || 0) + (longRide(d) ? 300 : 0);

  /** The rotation: the session after the last one logged. */
  function nextSession(): SessionKey {
    const w = sorted('workouts');
    if (!w.length) return 'UA';
    const last = w[w.length - 1];
    return ORDER[(ORDER.indexOf(last.session) + 1) % 4];
  }

  /** Sets for an exercise this phase: +1 on accessories from phase 2, +1 on
   *  upper compounds in the lean build, halved (rounded up) on a deload. */
  function setCount(ex: Exercise, sk: SessionKey, ph: PhaseKey, deload: boolean): number {
    let s = ex.s;
    const acc = ex.t === 'lat' || ex.t === 'row' || ex.t === 'arm';
    if (ph !== '1' && acc) s++;
    if (ph === '4' && SESS[sk].upper && !acc) s++;
    return deload ? Math.ceil(s / 2) : s;
  }

  /** No best-set improvement in the last 3 sessions vs everything before. */
  function plateau(k: string): boolean {
    const h = H[k];
    if (!h || h.length < 4) return false;
    const prev = Math.max(...h.slice(0, -3).map((x) => best(x.sets) ?? -1e9));
    const rec = Math.max(...h.slice(-3).map((x) => best(x.sets) ?? -1e9));
    return rec <= prev;
  }

  /** Double progression: hit the top of the range on every set → add load. */
  function exHint(ex: Exercise): Hint {
    const h = H[ex.k];
    if (!h || !h.length)
      return { c: 'info', t: `First time: pick a weight you can do for ${ex.r[0]} with 2–3 reps left.`, kg: '' };
    const last = h[h.length - 1];
    const top = last.sets.length ? Math.max(...last.sets.map((s) => num(s.kg) || 0)) : 0;
    if (plateau(ex.k)) return { c: 'warn', t: 'No progress for 3 sessions. Swap for a similar exercise.', kg: top };
    const hit = last.sets.length > 0 && last.sets.every((s) => (num(s.reps) || 0) >= ex.r[1]);
    if (hit) {
      const step = STEP[ex.inc];
      return { c: 'good', t: `Hit ${ex.r[1]} on every set → ${INC[ex.inc]}`, kg: step ? Math.round((top + step) * 10) / 10 : top };
    }
    return { c: 'info', t: 'Same weight, beat last time by a rep.', kg: top };
  }

  /** Checkpoint corridor (lo/hi kg) at day number d, linear between checkpoints. */
  function bandAt(d: number): { d: number; lo: number; hi: number } {
    const s = dn(cfg.startDate), sw = num(cfg.startWeight) || 102;
    const A = [{ d: s, lo: sw, hi: sw }, ...CPS.map((c) => ({ d: s + c.wk * 7, lo: c.lo, hi: c.hi }))];
    if (d <= A[0].d) return A[0];
    if (d >= A[A.length - 1].d) return A[A.length - 1];
    for (let i = 1; i < A.length; i++)
      if (d <= A[i].d) {
        const a = A[i - 1], b = A[i], f = (d - a.d) / (b.d - a.d);
        return { d, lo: a.lo + (b.lo - a.lo) * f, hi: a.hi + (b.hi - a.hi) * f };
      }
    return A[A.length - 1];
  }

  function coach(T: string): Flag[] {
    const out: Flag[] = [];
    const t = dn(T), wk = weekOf(T), ph = phaseOf(T), P = PHASES[ph];
    const recentAdj = !!cfg.adjDate && t - dn(cfg.adjDate) < 14;
    if (!D.weights[T]) out.push({ l: 'info', t: 'Weigh in today', b: 'Morning, after the bathroom, before food. Only the 7-day average matters.' });
    if (isDeloadWeek(wk)) out.push({ l: 'info', t: 'Deload week', b: 'Same exercises and weights, half the sets. The logger halves them for you.' });
    if (wk <= 4) out.push({ l: 'info', t: 'Technique weeks', b: 'Stay at 3 reps in reserve on every set until week 5.' });
    if (wk % 4 === 0) out.push({ l: 'info', t: 'Progress photos this week', b: 'Front, side, back. Same spot, same light, away from the overhead lights.' });
    const ws = sorted('waist');
    const lw = ws[ws.length - 1];
    if (!lw || t - dn(lw.date) >= 7) out.push({ l: 'info', t: 'Measure your waist', b: 'At the navel, once a week, same morning.' });

    // Weight trend
    const a0 = avg7(t), a1 = avg7(t - 7), a2 = avg7(t - 14);
    const c1 = a0 && a1 ? ((a0 - a1) / a1) * 100 : null;
    const c2 = a1 && a2 ? ((a1 - a2) / a2) * 100 : null;
    const pct = (v: number) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}%`;
    if (P.cut && c1 !== null) {
      if (c1 < -1 && c2 !== null && c2 < -1) {
        if (!recentAdj) out.push({ l: 'act', t: 'Losing too fast', b: `Down ${pct(c1)} and ${pct(c2)} the last two weeks. Add 200 kcal, mostly carbs. Mention the rate to your doctor too.`, adj: 200, al: 'Add 200 kcal' });
      } else if (c1 < -1) out.push({ l: 'warn', t: 'Fast week', b: `${pct(c1)} this week. If next week is also over 1%, add 200 kcal.` });
      else if (c1 <= -0.5) out.push({ l: 'good', t: 'Sweet spot', b: `${pct(c1)} this week. Change nothing.` });
      else if (c1 > -0.25 && c2 !== null && c2 > -0.25) {
        const cur = lw ? lw.cm : null;
        const before = ws.filter((x) => dn(x.date) <= t - 14).pop();
        const shrinking = cur != null && before && cur < before.cm - 0.4;
        if (shrinking) out.push({ l: 'good', t: 'Scale flat, waist shrinking', b: 'You are keeping muscle while losing fat. Hold steady.' });
        else if (!recentAdj) {
          if (ph === '3') out.push({ l: 'info', t: 'Phase 4 check', b: 'Weight has stalled. If you can see the top of your abs in normal light, start the lean build in settings.' });
          out.push({ l: 'act', t: 'Stalled two weeks', b: 'Weight and waist are flat. Cut 150 kcal from carbs, or add one easy ride a week.', adj: -150, al: 'Cut 150 kcal' });
        }
      } else out.push({ l: 'info', t: 'Slow week', b: `${pct(c1)} this week. Fine if the waist is dropping.` });
    } else if (ph === '4' && c1 !== null) out.push({ l: 'info', t: 'Lean build', b: `Maintenance + 200–300 kcal. Weekly change ${pct(c1)}.` });
    else if (ph === 'B') out.push({ l: 'info', t: 'Diet break', b: 'Eat at maintenance (about 2,600 kcal) and train normally for two weeks.' });
    if (P.cut && c1 !== null && c1 < -1) out.push({ l: 'warn', t: 'Tell your doctor', b: 'The plan says to flag losing faster than 1% a week to your prescriber.' });

    // Nutrition
    const days: Array<{ kcal: number; p: number }> = [];
    for (let d = t - 7; d < t; d++) { const n = nutTotals(iso(d)); if (n) days.push(n); }
    if (days.length >= 4) {
      const ak = sum(days.map((x) => x.kcal)) / days.length, ap = sum(days.map((x) => x.p)) / days.length;
      if (ak < 1800) out.push({ l: 'warn', t: 'Eating under 1,800 kcal', b: `7-day average is ${thou(ak)} kcal. The plan says to tell your doctor if this keeps happening.` });
      if (ap < PROTEIN - 15) out.push({ l: 'warn', t: `Protein below ${PROTEIN} g`, b: `7-day average is ${Math.round(ap)} g. Add a shake or a second yogurt bowl.` });
    }

    // Lifts
    let downs = 0, ups = 0;
    for (const k in EXBY) {
      if (!EXBY[k].main || !H[k]) continue;
      const rec = H[k].filter((x) => dn(x.date) > t - 14);
      const prev = H[k].filter((x) => dn(x.date) <= t - 14 && dn(x.date) > t - 28);
      if (!rec.length || !prev.length) continue;
      const r = Math.max(...rec.map((x) => best(x.sets) ?? -1e9));
      const p = Math.max(...prev.map((x) => best(x.sets) ?? -1e9));
      if (r < p * 0.98) downs++;
      else if (r > p * 1.01) ups++;
    }
    if (downs >= 2 && ups === 0) out.push({ l: 'act', t: 'Lifts falling', b: 'Main lifts are down over two weeks. Add 150–200 kcal on training days and check your sleep.' });
    const pl = Object.keys(H).filter(plateau).map((k) => EXBY[k]?.n).filter(Boolean);
    if (pl.length) out.push({ l: 'warn', t: 'Stuck exercises', b: `${pl.slice(0, 3).join(', ')}: no progress in 3 sessions. Swap each for a similar exercise.` });

    // Rides
    const hard = sorted('rides').filter((r) => dn(r.date) > t - 7 && dn(r.date) <= t && r.type === 'hard').length;
    if (P.cut && hard > 2) out.push({ l: 'warn', t: 'Too many hard rides', b: `${hard} hard rides in 7 days. Keep it to 2 during the cut so they don't eat into lifting recovery.` });

    // Sleep
    const sl: number[] = [];
    for (let d = t - 7; d < t; d++) { const r = D.recovery[iso(d)]; if (r && Number.isFinite(num(r.sleep))) sl.push(num(r.sleep)); }
    if (sl.length >= 4 && sum(sl) / sl.length < 7)
      out.push({ l: 'warn', t: 'Short on sleep', b: `Averaging ${k1(sum(sl) / sl.length)} h. Aim for 7–9 h per 24 h: blackout curtains, cool room, same window per shift block.` });

    const rank: Record<FlagLevel, number> = { act: 0, warn: 1, info: 2, good: 3 };
    return out.sort((a, b) => rank[a.l] - rank[b.l]);
  }

  return {
    cfg, sorted, H, weekOf, phaseOf, isDeloadWeek, avg7, nutTotals, longRide, kcalTarget,
    nextSession, setCount, plateau, exHint, bandAt, coach,
  };
}
export type Viking = ReturnType<typeof viking>;
