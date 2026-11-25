// Project Viking — turn a Garmin strength activity into a workout doc. Pure: no Node, Deno or DOM APIs.
import { EXBY, SESS } from './data.ts';
import type { Exercise, SessionKey } from './data.ts';
import { GARMIN_EX } from './garmin.ts';
import type { StrengthTarget } from './garmin.ts';
import { viking } from './logic.ts';
import type { SetEntry, VikingData, WorkoutDoc } from './logic.ts';

export type GarminSet = { category: string | null; name: string | null; reps: number | null; weightG: number | null; type: string; idx: number | null };
export type GarminIn = {
  activityId: string; name: string; date: string; start: string; startUtc: string; insertedAt: string;
  sets: GarminSet[]; processedAt?: string | null; result?: string; attempts?: number;
};
export type ImportResult = { session: SessionKey; docId: string; doc: WorkoutDoc; assumptions: string[]; dropped: number; merged: boolean };
type Planned = Record<string, StrengthTarget> | null;

const SKS: SessionKey[] = ['UA', 'LA', 'UB', 'LB'];
const PREFIX: Record<string, SessionKey> = { 'Upper A': 'UA', 'Lower A': 'LA', 'Upper B': 'UB', 'Lower B': 'LB' };

export const shortName = (k: string): string => EXBY[k].n.split(' / ')[0].split(' (')[0];

export function sessionOf(a: GarminIn): SessionKey | null {
  const m = /^Viking (Upper|Lower) (A|B)/.exec(a.name);
  if (m) return PREFIX[`${m[1]} ${m[2]}`];
  const score = SKS.map((sk) => {
    const cats = new Set(SESS[sk].ex.map((e) => GARMIN_EX[e.k]?.category).filter(Boolean));
    return a.sets.filter((s) => s.type === 'ACTIVE' && s.category && cats.has(s.category)).length;
  });
  const top = Math.max(...score);
  if (top < 3 || score.filter((x) => x === top).length > 1) return null;
  return SKS[score.indexOf(top)];
}

/** Map one ACTIVE set to a session exercise key, or null. */
function mapSet(sk: SessionKey, s: GarminSet): string | null {
  const exs = SESS[sk].ex;
  const cat = s.category && s.category !== 'UNKNOWN' ? s.category : null;
  if (s.idx != null && s.idx % 3 === 0 && exs[s.idx / 3]) {
    const c = exs[s.idx / 3];
    const gx = GARMIN_EX[c.k];
    if (gx) {
      if (gx.category === s.category && (!gx.exerciseName || !s.name || gx.exerciseName === s.name)) return c.k;
    } else if (!cat || !exs.some((e) => e.k !== c.k && GARMIN_EX[e.k]?.category === cat)) return c.k;
  }
  if (!cat) return null;
  const same = exs.filter((e) => GARMIN_EX[e.k]?.category === cat);
  const named = same.find((e) => s.name && GARMIN_EX[e.k]?.exerciseName === s.name);
  if (named) return named.k;
  return same.length === 1 ? same[0].k : null;
}

const half = (g: number) => Math.round(g / 1000 * 2) / 2;

/** The one builder of assumption lines, in plan order. */
export function assumptionsFor(doc: WorkoutDoc, planned: Planned, D: VikingData): string[] {
  const v = viking(D);
  const out: string[] = [];
  for (const ex of SESS[doc.session].ex) {
    const sn = shortName(ex.k);
    const e = doc.entries.find((x) => x.ex === ex.k);
    if (!e || !e.sets.length) { out.push(`${sn}: not recorded`); continue; }
    const assist = planned?.[ex.k]?.assistKg;
    if (ex.inc === 'pull' && assist != null && assist < 0) out.push(`${sn}: assist taken as ${Math.abs(assist)} kg (the watch can't record it)`);
    const r = e.sets.find((s) => s.est?.includes('reps'));
    if (r) out.push(`${sn}: reps not recorded, assumed ${r.reps}`);
    if (e.sets.some((s) => s.est?.includes('kg'))) out.push(`${sn}: kg not recorded`);
    const want = planned?.[ex.k]?.sets ?? v.setCount(ex, doc.session, doc.phase, doc.deload);
    if (e.sets.length < want) out.push(`${sn}: ${e.sets.length} of ${want} sets`);
  }
  return out;
}

export function importStrength(
  a: GarminIn, D: VikingData, planned: Planned, savedAt: number,
): ImportResult | { skip: 'not-viking' | 'owner-doc' } | { skip: 'already'; docId: string; dropped: number } {
  const sk = sessionOf(a);
  if (!sk) return { skip: 'not-viking' };
  const v = viking(D);
  const wk = v.weekOf(a.date), phase = v.phaseOf(a.date), deload = v.isDeloadWeek(wk);
  const exs = SESS[sk].ex;
  const bySet = new Map<string, SetEntry[]>();
  let dropped = 0;
  let prev: { g: number | null; k: string | null } | null = null;
  for (const s of a.sets) {
    if (s.type !== 'ACTIVE') continue;
    const k = mapSet(sk, s);
    const before = prev;
    prev = { g: s.weightG, k };
    if (!k) { dropped++; continue; }
    const ex: Exercise = EXBY[k];
    const p = planned?.[k];
    const est: Array<'kg' | 'reps'> = [];
    let kg: number;
    if (ex.inc === 'bw') kg = 0;
    else if (ex.inc === 'pull') kg = s.weightG == null ? (p?.assistKg != null && p.assistKg <= 0 ? p.assistKg : 0) : half(s.weightG);
    else if (s.weightG == null) { kg = p?.kg != null && p.kg > 0 ? p.kg : 0; est.push('kg'); }
    else if (before && before.g === s.weightG && before.k !== k && !(p?.kg != null && p.kg > 0)) { kg = 0; est.push('kg'); }
    else kg = half(s.weightG);
    let reps = s.reps ?? 0;
    if (s.reps == null) { reps = p?.reps ?? ex.r[0]; est.push('reps'); }
    (bySet.get(k) ?? bySet.set(k, []).get(k)!).push({ kg, reps, ...(est.length ? { est } : {}) });
  }
  const docId = `${a.date}_${sk}`;
  const ex0 = D.workouts[docId];
  if (ex0 && !ex0.source) return { skip: 'owner-doc' };
  if (ex0?.garminIds?.includes(a.activityId)) return { skip: 'already', docId, dropped };
  const old = new Map((ex0?.entries ?? []).map((e) => [e.ex, e.sets]));
  const entries = exs
    .map((e) => ({ ex: e.k, sets: [...(old.get(e.k) ?? []), ...(bySet.get(e.k) ?? [])] }))
    .filter((e) => e.sets.length);
  const doc: WorkoutDoc = ex0
    ? { ...ex0, entries, savedAt, garminIds: [...(ex0.garminIds ?? []), a.activityId],
        startedAt: ex0.startedAt && ex0.startedAt < a.startUtc ? ex0.startedAt : a.startUtc }
    : { date: a.date, session: sk, week: wk, phase, deload, entries, savedAt, source: 'garmin', garminIds: [a.activityId], startedAt: a.startUtc };
  const assumptions = assumptionsFor(doc, planned, D);
  if (dropped > 0) assumptions.push(`${dropped} unrecognised set${dropped === 1 ? '' : 's'} left out`);
  return { session: sk, docId, doc, assumptions, dropped, merged: !!ex0 };
}
