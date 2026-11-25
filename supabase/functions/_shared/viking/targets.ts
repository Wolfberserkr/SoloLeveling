// What the watch shows next: double progression over the logged sets, using
// only values that were really recorded (never the assumed ones).
import { EXBY, SESS, STEP, type Exercise, type IncKey, type SessionKey } from './data.ts';
import { score, type SetEntry, type Viking } from './logic.ts';
import type { StrengthTarget } from './garmin.ts';

export type Overrides = { kg?: Record<string, number> };
/** exercise → ISO timestamp of its last reset. */
export type Resets = Record<string, string>;
export type Progress = StrengthTarget & { stalled: boolean; lastTop: number | null; repsUnknown: boolean };
export type Hist = Array<{ date: string; startedAt?: string; planned?: number; sets: SetEntry[] }>;
export const WEIGHTED: IncKey[] = ['bbU', 'bbL', 'mU', 'mL', 'db', 'iso'];

const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function resetKg(top: number, inc: IncKey): number {
  const step = STEP[inc] || 0.5;
  return r1(Math.floor((0.9 * top) / step) * step);
}

const repsReal = (s: SetEntry) => !s.est?.includes('reps');
const kgReal = (s: SetEntry, pull: boolean) => (pull ? s.kg < 0 : s.kg > 0) && !s.est?.includes('kg');

function stalledOf(bests: number[]): boolean {
  if (bests.length < 4) return false;
  const rec = Math.max(...bests.slice(-3)), prev = Math.max(...bests.slice(0, -3));
  return rec <= prev;
}

export function progressFor(
  ex: Exercise, hist: Hist, resetAt: string | undefined, sets: number, override?: number,
): Progress {
  const [lo, hi] = ex.r;
  const pull = ex.inc === 'pull', bw = ex.inc === 'bw';
  const weighted = !pull && !bw;
  const cut = resetAt ? Date.parse(resetAt) : NaN;
  const h = Number.isNaN(cut) ? hist : hist.filter((x) => x.startedAt !== undefined && Date.parse(x.startedAt) > cut);

  const out = (kg: number | null, reps: number, note: string, extra: Partial<Progress> = {}): Progress => ({
    kg, reps: clamp(reps, lo, hi), sets, note, stalled: false, lastTop: null, repsUnknown: false, ...extra,
  });

  // Known sessions: weighted/pull need a real kg, bodyweight a real rep count.
  const known = h.filter((x) => x.sets.some((s) => (bw ? repsReal(s) && s.reps > 0 : kgReal(s, pull))));
  const bests = known
    .map((x) => x.sets.filter((s) => repsReal(s) && (bw || kgReal(s, pull))))
    .filter((x) => x.length)
    .map((x) => Math.max(...x.map(score)));

  const last = known[known.length - 1];
  const lastTop = last && !bw
    ? Math.max(...last.sets.filter((s) => kgReal(s, pull)).map((s) => s.kg))
    : null;

  if (override !== undefined && weighted && override > 0)
    return out(override, lo, 'Reset: back off and rebuild', { stalled: false, lastTop });

  if (!last) {
    if (bw || pull) return out(null, lo, h.length ? 'Reps not recorded yet' : 'First time', pull ? { assistKg: null } : {});
    return out(null, lo, h.length ? 'kg not recorded yet' : 'First time');
  }

  const planned = last.planned ?? last.sets.length;
  const countOk = last.sets.length >= planned;
  const allReal = last.sets.every(repsReal);
  const unknown = !allReal;
  const hit = !bw && countOk && allReal && last.sets.every((s) => s.reps >= hi);
  const realReps = last.sets.filter(repsReal).map((s) => s.reps);
  const lowest = realReps.length ? Math.min(...realReps) : lo;
  const heldReps = Math.min(...last.sets.map((s) => s.reps));
  const stalled = !hit && stalledOf(bests);

  if (bw) {
    if (unknown) return out(null, heldReps, 'Reps not recorded: same target', { repsUnknown: true, stalled });
    const next = lowest + 1;
    return out(null, next, next >= hi ? 'Top of range: slow the tempo' : 'Beat last time by a rep', { stalled });
  }

  if (pull) {
    const assist = lastTop as number;
    if (unknown) return out(null, heldReps, 'Reps not recorded: same target', { assistKg: assist, repsUnknown: true, stalled, lastTop: assist });
    if (hit) {
      const a = Math.min(0, r1(assist + 2.5));
      return out(null, lo, `Less assist: ${Math.abs(a)} kg`, { assistKg: a, stalled, lastTop: assist });
    }
    return out(null, lowest + 1, 'Same assist, beat last time by a rep', { assistKg: assist, stalled, lastTop: assist });
  }

  const top = lastTop as number;
  if (unknown)
    return out(top, heldReps, 'Reps not recorded: same target, no advance', { repsUnknown: true, stalled, lastTop: top });
  if (hit) return out(r1(top + STEP[ex.inc]), lo, `Hit ${hi} on every set: +${STEP[ex.inc]} kg`, { lastTop: top });
  return out(top, lowest + 1, 'Same weight, beat last time by a rep', { stalled, lastTop: top });
}

export function nextTargets(
  v: Viking, sk: SessionKey, date: string, ov: Overrides, resets: Resets,
): Record<string, Progress> {
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
  const wk = v.weekOf(date), ph = v.phaseOf(date), dl = v.isDeloadWeek(wk);
  const out: Record<string, Progress> = {};
  for (const ex of SESS[sk].ex)
    out[ex.k] = progressFor(ex, hist[ex.k] ?? [], resets[ex.k], v.setCount(ex, sk, ph, dl), ov.kg?.[ex.k]);
  return out;
}
