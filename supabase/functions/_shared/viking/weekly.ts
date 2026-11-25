// The weekly picture (last 7 days vs the 7 before) and the "reset this lift?"
// suggestions. Pure: today and "now" are passed in.
import { bike, isHard } from './bikeLogic.ts';
import { BIKE_PHASES, Z2_TARGET } from './bikePlan.ts';
import { EXBY } from './data.ts';
import { shortName } from './garminImport.ts';
import { dn, iso, num, score, sum, viking, type SetEntry, type VikingData } from './logic.ts';
import { progressFor, resetKg, WEIGHTED, type Hist, type Resets } from './targets.ts';

export type Suggestion = {
  id: string; kind: 'reset'; ex: string; kg: number;
  status: 'pending' | 'ok' | 'no' | 'applied';
  createdAt: string; decidedAt?: string; snoozeUntil?: number;
};

export type WeeklySummary = {
  from: string; to: string;
  lifts: Array<{
    ex: string; name: string; sessions: number; topKg: number | null; prevTopKg: number | null;
    bestE1rm: number | null; pr: boolean; stalled: boolean; repsUnknown: number;
  }>;
  sessions: { done: number; slidDays: number };
  rides: { z2: number; z2Target: number; hard: number; cap: number; minutes: number };
  deloadNext: boolean;
  retestDue: boolean;
};

const real = (s: SetEntry) => !s.est?.length;
const maxOf = (a: number[]) => (a.length ? Math.max(...a) : null);

/** Every exercise's sessions, oldest first (same shape the targets use). */
function histories(v: ReturnType<typeof viking>): Record<string, Hist> {
  const hist: Record<string, Hist> = {};
  for (const doc of v.sorted('workouts'))
    for (const e of doc.entries ?? []) {
      const ex = EXBY[e.ex];
      if (!ex) continue;
      (hist[e.ex] ??= []).push({
        date: doc.date,
        startedAt: doc.startedAt ?? (doc.savedAt ? new Date(doc.savedAt).toISOString() : undefined),
        planned: v.setCount(ex, doc.session, doc.phase, doc.deload),
        sets: e.sets ?? [],
      });
    }
  return hist;
}

export function weekSummary(D: VikingData, today: string, slidDates: string[], resets: Resets): WeeklySummary {
  const v = viking(D), t = dn(today);
  const from = iso(t - 7), to = iso(t - 1), prevFrom = iso(t - 14);
  const hist = histories(v);
  const wk = v.weekOf(today), ph = v.phaseOf(today), dl = v.isDeloadWeek(wk);

  const lifts: WeeklySummary['lifts'] = [];
  for (const k of Object.keys(EXBY)) {
    const h = hist[k] ?? [];
    const inR = h.filter((x) => x.date >= from && x.date <= to);
    if (!inR.length) continue;
    const prev = h.filter((x) => x.date >= prevFrom && x.date < from);
    const realKg = (list: Hist) => list.flatMap((x) => x.sets.filter((s) => real(s) && s.kg > 0).map((s) => s.kg));
    const realScores = (list: Hist) => list.flatMap((x) => x.sets.filter(real).map(score));
    const bestE1rm = maxOf(realScores(inR));
    const earlier = maxOf(realScores(h.filter((x) => x.date < from)));
    const ex = EXBY[k];
    lifts.push({
      ex: k, name: shortName(k), sessions: inR.length,
      topKg: maxOf(realKg(inR)), prevTopKg: maxOf(realKg(prev)),
      bestE1rm, pr: bestE1rm !== null && earlier !== null && bestE1rm > earlier,
      stalled: progressFor(ex, h, resets[k], v.setCount(ex, ex.sess, ph, dl)).stalled,
      repsUnknown: inR.filter((x) => x.sets.some((s) => s.est?.includes('reps'))).length,
    });
  }

  const inRange = (d: string) => d >= from && d <= to;
  const rides = v.sorted('rides').filter((r) => inRange(r.date));
  const z2 = sum(rides.map((r) => {
    if (Number.isFinite(num(r.z2))) return num(r.z2);
    const easyZ2 = r.code ? r.code === 'E1' || r.code === 'L1' : r.type === 'easy';
    return easyZ2 ? r.minutes || 0 : 0;
  }));
  const phTo = v.phaseOf(to);

  return {
    from, to, lifts,
    sessions: {
      done: v.sorted('workouts').filter((w) => inRange(w.date)).length,
      slidDays: slidDates.filter(inRange).length,
    },
    rides: {
      z2, z2Target: phTo === '1' ? Z2_TARGET.phase1 : Z2_TARGET.later,
      hard: rides.filter(isHard).length, cap: BIKE_PHASES[phTo].hardCap,
      minutes: sum(rides.map((r) => r.minutes || 0)),
    },
    deloadNext: v.isDeloadWeek(wk + 1),
    retestDue: bike(v).retestDue(today) !== null,
  };
}

export function suggestionsFor(D: VikingData, existing: Suggestion[], resets: Resets, nowIso: string): Suggestion[] {
  const v = viking(D);
  const hist = histories(v);
  const docs = v.sorted('workouts');
  const startOf = (w: { startedAt?: string; savedAt: number }) => Date.parse(w.startedAt ?? new Date(w.savedAt).toISOString());

  // ok → applied once a later session with that exercise exists.
  const out = existing.map((s) => {
    if (s.status !== 'ok') return s;
    const since = Date.parse(s.decidedAt ?? s.createdAt);
    const used = docs.some((w) => w.entries?.some((e) => e.ex === s.ex) && startOf(w) > since);
    return used ? { ...s, status: 'applied' as const } : s;
  });

  const ph = v.phaseOf(nowIso.slice(0, 10)), dl = v.isDeloadWeek(v.weekOf(nowIso.slice(0, 10)));
  for (const ex of Object.values(EXBY)) {
    if (!WEIGHTED.includes(ex.inc)) continue;
    const mine = out.filter((s) => s.ex === ex.k);
    if (mine.some((s) => s.status === 'pending' || s.status === 'ok')) continue;
    const count = docs.filter((w) => w.entries?.some((e) => e.ex === ex.k)).length;
    if (mine.some((s) => s.status === 'no' && (s.snoozeUntil ?? 0) > count)) continue;
    const p = progressFor(ex, hist[ex.k] ?? [], resets[ex.k], v.setCount(ex, ex.sess, ph, dl));
    if (!p.stalled || p.lastTop === null || p.lastTop <= 0) continue;
    out.push({
      id: `${ex.k}-${nowIso.slice(0, 10)}`, kind: 'reset', ex: ex.k,
      kg: resetKg(p.lastTop, ex.inc), status: 'pending', createdAt: nowIso,
    });
  }
  return out;
}
