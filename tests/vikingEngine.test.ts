import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COLLS, emptyData, viking, type CycleDoc, type Settings, type VikingData, type WorkoutDoc } from '../supabase/functions/_shared/viking/logic.ts';
import { importStrength, type GarminIn, type ImportResult } from '../supabase/functions/_shared/viking/garminImport.ts';
import { nextTargets } from '../supabase/functions/_shared/viking/targets.ts';
import type { Health, PlanCurrent } from '../supabase/functions/_shared/viking/planner.ts';
import { addDays } from '../supabase/functions/_shared/lifeLogic.ts';
import { confirmReps, type Keyboard } from '../supabase/functions/_shared/viking/recap.ts';
import { runVikingTick, type PlanState, type VikingStore } from '../supabase/functions/_shared/viking/engine.ts';

const TZ = 'America/Aruba';
const load = (f: string) => JSON.parse(readFileSync(`tests/fixtures/${f}`, 'utf8')) as GarminIn;
const LA = load('garmin-2026-11-25-lower-a.json'), UA = load('garmin-2026-11-24-upper-a.json'), UB = load('garmin-2026-11-20-upper-b-deload.json');
const SETTINGS: Settings = { startDate: '2026-10-10', startWeight: 102, phaseMode: 'auto', kcalAdjust: 0 };
const wo = (date: string, session: WorkoutDoc['session'], entries: WorkoutDoc['entries'] = []): WorkoutDoc =>
  ({ date, session, week: 7, phase: '1', deload: false, entries, savedAt: 1 });
const LB22 = wo('2026-11-22', 'LB', [{ ex: 'trapdl', sets: [0, 1, 2].map(() => ({ kg: 120, reps: 6 })) }]);
const clone = <T>(x: T): T => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const MIN = 60_000;

type Ctx = Awaited<ReturnType<VikingStore['context']>>;

/** In-memory VikingStore. The inbox comes back in insertion order (not sorted)
 *  on purpose, so the engine's own date order is what's tested. */
class MemoryStore implements VikingStore {
  docs = new Map<string, Map<string, any>>();
  claims = new Set<string>();
  sent: Array<{ text: string; kb?: Keyboard | null }> = [];
  puts: string[] = [];
  loads = 0;
  settings: Settings | null = SETTINGS;
  clock = new Date('2026-11-25T18:00:00Z');
  ctx: Ctx = { afterNight: new Set(), windows: {}, wakeAt: {} };
  failPut: Array<(coll: string, id: string) => boolean> = [];
  failSend = false;
  calendar: VikingStore['calendar'] = null;
  unpins: string[][] = [];

  constructor(seed: Partial<VikingData> = {}) {
    for (const c of COLLS) for (const [id, d] of Object.entries(seed[c] ?? {})) this.set(c, id, d);
  }
  coll(c: string) { return (this.docs.get(c) ?? (this.docs.set(c, new Map()), this.docs.get(c)!)); }
  get(c: string, id: string) { return clone(this.coll(c).get(id)); }
  set(c: string, id: string, d: unknown) { this.coll(c).set(id, clone(d)); }
  all(c: string) { return Object.fromEntries([...this.coll(c)].map(([k, v]) => [k, clone(v)])); }
  inbox(...a: GarminIn[]) { for (const x of a) this.set('garmin_in', x.activityId, x); }
  D(): VikingData {
    const D: VikingData = { ...emptyData(), settings: clone(this.settings) };
    for (const c of COLLS) (D as any)[c] = this.all(c);
    return D;
  }
  failOnce(coll: string) {
    let done = false;
    this.failPut.push((c) => { if (c !== coll || done) return false; done = true; return true; });
  }

  async load() {
    this.loads++;
    const today = this.clock.toISOString().slice(0, 10);
    const plan = this.all('plan');
    const snapshots: Record<string, any> = {}, decisions: Record<string, any> = {};
    for (const [k, v] of Object.entries(plan)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && k >= addDays(today, -14)) snapshots[k] = v;
      if (k.startsWith('decision-')) decisions[k.slice('decision-'.length)] = v;
    }
    return {
      D: this.D(), current: (plan.current ?? null) as PlanCurrent | null, state: (plan.state ?? null) as PlanState | null,
      garmin: plan.garmin ?? {}, inbox: Object.values(this.all('garmin_in')).filter((x: any) => !x.processedAt) as GarminIn[],
      snapshots, decisions, pins: plan.pins ?? {},
      inserted: Object.values(this.all('garmin_in'))
        .filter((x: any) => x.date >= addDays(today, -8))
        .map((x: any) => ({ date: x.date, insertedAt: x.insertedAt })),
    };
  }
  async unpin(dates: string[]) {
    this.unpins.push([...dates]);
    const pins = { ...(this.get('plan', 'pins') ?? {}) };
    for (const d of dates) delete pins[d];
    this.set('plan', 'pins', pins);
  }
  async hasWork() {
    const now = this.clock.getTime();
    const ready = Object.values(this.all('garmin_in')).some((x: any) => !x.processedAt && (!x.lastFailedAt || now - Date.parse(x.lastFailedAt) >= 15 * MIN));
    const seen = this.get('plan', 'state')?.healthSeenAt;
    const health = !!this.ctx.healthUpdatedAt && (!seen || Date.parse(this.ctx.healthUpdatedAt) > Date.parse(seen));
    const hashGone = !this.get('plan', 'current')?.hash;
    return ready || health || hashGone;
  }
  async put(coll: string, id: string, data: unknown) {
    if (this.failPut.some((f) => f(coll, id))) throw new Error(`put ${coll}/${id} failed`);
    this.puts.push(`${coll}/${id}`);
    this.set(coll, id, data);
  }
  async merge(coll: string, id: string, patch: Record<string, unknown>) { this.set(coll, id, { ...(this.get(coll, id) ?? {}), ...patch }); }
  async claim(key: string) { if (this.claims.has(key)) return false; this.claims.add(key); return true; }
  async release(key: string) { this.claims.delete(key); }
  async send(text: string, kb?: Keyboard | null) { if (this.failSend) throw new Error('telegram 502'); this.sent.push({ text, kb }); }
  async context(): Promise<Ctx> { return { ...this.ctx, afterNight: new Set(this.ctx.afterNight) }; }
}

const run = (s: MemoryStore, at: string, since = '2026-11-24') => {
  s.clock = new Date(at);
  return runVikingTick(s, s.clock, TZ, since);
};
const later = (at: string, min: number) => new Date(Date.parse(at) + min * MIN).toISOString();
const recaps = (s: MemoryStore) => s.sent.filter((m) => m.text.includes(' saved</b>'));
const count = (s: MemoryStore, key: string) => s.puts.filter((p) => p === key).length;
const T = '2026-11-25T18:00:00Z';

describe('viking engine', () => {
it('engine: no settings → nothing written', async () => {
  const s = new MemoryStore();
  s.settings = null; s.inbox(LA);
  expect(await run(s, T)).toEqual({ imported: 0, ticks: 0, rebuilt: false, calendarOps: 0 });
  expect(s.puts).toEqual([]); expect(s.sent).toEqual([]); expect(s.claims.size).toBe(0);
});

it('engine: imports 24 and 25 Nov, ticks days 1 and 2, sends two recaps, plan starts at day 3', async () => {
  const s = new MemoryStore({ workouts: { '2026-11-22_LB': LB22 } });
  s.inbox(UA, LA);
  const r = await run(s, T);
  expect(r).toMatchObject({ imported: 2, ticks: 2, rebuilt: true });
  expect(Object.keys(s.all('workouts')).sort()).toEqual(['2026-11-22_LB', '2026-11-24_UA', '2026-11-25_LA']);
  const cyc = s.all('cycle') as Record<string, CycleDoc>;
  expect(Object.keys(cyc).sort()).toEqual(['2026-11-24_auto_1', '2026-11-25_auto_2']);
  expect(Object.values(cyc).every((t) => t.status === 'done')).toBe(true);
  expect(s.get('garmin_in', LA.activityId)).toMatchObject({ result: '2026-11-25_LA', dropped: 0, processedAt: T.replace('Z', '.000Z') });
  expect(recaps(s)).toHaveLength(2);
  const pc = s.get('plan', 'current') as PlanCurrent;
  expect(pc.days[0]).toMatchObject({ date: '2026-11-26', cycleDay: 3 });
  expect(pc.days).toHaveLength(7);
  expect((s.get('plan', 'state') as PlanState).settledThrough).toBe('2026-11-24');
  expect(s.get('plan', 'weekly')).toMatchObject({ to: '2026-11-24' });
});

it('engine: idempotent, one recap', async () => {
  const s = new MemoryStore({ workouts: { '2026-11-22_LB': LB22 } });
  s.inbox(UA, LA);
  await run(s, T);
  const sent = s.sent.length, w = s.all('workouts'), c = s.all('cycle');
  const r = await run(s, T);
  expect(r).toMatchObject({ imported: 0, ticks: 0 });
  expect(s.sent.length).toBe(sent);
  expect(s.all('workouts')).toEqual(w); expect(s.all('cycle')).toEqual(c);
  expect(count(s, 'plan/current')).toBe(1);
});

it('engine: stream order', async () => {
  const s = new MemoryStore({ workouts: { '2026-11-22_LB': LB22 } });
  s.inbox(LA, UA); // LA first in the inbox array
  await run(s, T);
  const [first, second] = recaps(s);
  expect(first.text).toContain('Upper A saved');
  expect(first.text).toContain('🔄 New lap: Upper A started it.');
  expect(second.text).toContain('Lower A saved');
  expect(second.text).not.toContain('New lap');
  expect(second.text).not.toContain('Swapped');
  expect(Object.keys(s.all('cycle')).sort()).toEqual(['2026-11-24_auto_1', '2026-11-25_auto_2']);
});

it('engine: four uncounted squat sessions never raise the kg', async () => {
  const s = new MemoryStore();
  const dates = ['2026-11-25', '2026-12-03', '2026-12-11', '2026-12-19'];
  for (const [n, date] of dates.entries()) {
    s.inbox({ ...LA, activityId: `la${n}`, date, start: `${date}T06:11`, startUtc: `${date}T10:11:12Z`, sets: LA.sets.map((x) => ({ ...x, reps: null })) });
    await run(s, `${date}T18:00:00Z`, '2026-11-25');
    expect(s.get('workouts', `${date}_LA`)).toBeDefined();
    const t = nextTargets(viking(s.D()), 'LA', addDays(date, 1), {}, {});
    expect(t.squat.kg).toBe(110);
    expect(t.squat.repsUnknown).toBe(true);
  }
  expect(recaps(s)).toHaveLength(4);
  expect(recaps(s).some((m) => m.text.includes('Next time: Back squat'))).toBe(false);
});

it('engine: a confirmed session advances', async () => {
  const s = new MemoryStore();
  s.inbox(LA);
  await run(s, T);
  const doc = confirmReps(s.get('workouts', '2026-11-25_LA'), 'all');
  s.set('workouts', '2026-11-25_LA', doc);
  expect(doc.entries[0]).toEqual({ ex: 'squat', sets: [0, 1, 2].map(() => ({ kg: 110, reps: 5 })) });
  expect(nextTargets(viking(s.D()), 'LA', '2026-12-03', {}, {}).squat).toMatchObject({ kg: 110, reps: 6, repsUnknown: false });
});

it('engine: a failed send never loses the import', async () => {
  const s = new MemoryStore();
  s.inbox(LA);
  s.failSend = true;
  const r = await run(s, T);
  expect(r).toMatchObject({ imported: 1, ticks: 1 });
  expect(s.get('workouts', '2026-11-25_LA')).toBeDefined();
  expect(Object.keys(s.all('cycle'))).toHaveLength(1);
  expect(s.get('garmin_in', LA.activityId).processedAt).toBeTruthy();
  expect(s.claims.has('vkrecap:' + LA.activityId)).toBe(true);
  s.failSend = false;
  await run(s, later(T, 15));
  expect(s.sent).toEqual([]);
});

it('engine: a throw after the claim releases it', async () => {
  const s = new MemoryStore();
  s.inbox(LA);
  s.failOnce('workouts');
  expect(await run(s, T)).toMatchObject({ imported: 0 });
  expect(s.claims.has('vkimp:' + LA.activityId)).toBe(false);
  expect(s.get('garmin_in', LA.activityId)).toMatchObject({ attempts: 1, lastFailedAt: T.replace('Z', '.000Z') });
  expect(s.get('garmin_in', LA.activityId).processedAt).toBeUndefined();
  expect(s.sent).toEqual([]);
  expect(await run(s, later(T, 15))).toMatchObject({ imported: 1, ticks: 1 });
  expect(s.get('workouts', '2026-11-25_LA')).toBeDefined();
  expect(recaps(s)).toHaveLength(1);
});

it('engine: a throw on the cycle put still ticks on retry', async () => {
  for (const [fx, since, sk] of [[LA, '2026-11-24', 'LA'], [UB, '2026-11-20', 'UB']] as const) {
    const s = new MemoryStore();
    s.inbox(fx);
    s.failOnce('cycle');
    await run(s, T, since);
    const docId = `${fx.date}_${sk}`;
    expect(s.get('workouts', docId)).toBeDefined();
    expect(s.all('cycle')).toEqual({});
    expect(s.get('garmin_in', fx.activityId).processedAt).toBeUndefined();
    expect(s.sent).toEqual([]);

    const r = await run(s, later(T, 15), since);
    expect(r).toMatchObject({ imported: 1, ticks: 1 });
    expect(Object.values(s.all('cycle'))).toHaveLength(1);
    expect(s.get('garmin_in', fx.activityId)).toMatchObject({ result: docId });
    expect(s.get('garmin_in', fx.activityId).processedAt).toBeTruthy();
    expect(recaps(s)).toHaveLength(1);
    const [m] = recaps(s);
    expect(m.kb?.at(-1)).toEqual([{ text: '✅ All as planned', data: `vr:${fx.activityId}:all` }]);
    const first = importStrength(fx, { ...emptyData(), settings: SETTINGS }, null, 1) as ImportResult;
    for (const a of first.assumptions) expect(m.text).toContain(`• ${a}`);
    if (sk === 'LA') {
      expect(m.text).toContain('Romanian deadlift: 2 of 3 sets');
      expect((s.get('plan', 'current') as PlanCurrent).days[0]).toMatchObject({ date: '2026-11-26', cycleDay: 3 });
    } else {
      expect(m.text).toContain('1 unrecognised set left out');
      expect(m.text).toContain('🔄 New lap: Upper B started it.');
    }
  }
});

it('engine: a poison doc gives up after 3 tries over an hour', async () => {
  const s = new MemoryStore();
  const bad = { ...LA, activityId: 'p1', sets: null } as unknown as GarminIn;
  s.inbox(bad);
  const t0 = '2026-11-25T18:14:00Z';
  await run(s, t0);
  expect(s.get('garmin_in', 'p1')).toMatchObject({ attempts: 1 });
  await run(s, later(t0, 1)); // 18:15 passes the gate, but the doc waits
  expect(s.claims.has('vkimp:p1')).toBe(false);
  expect(s.get('garmin_in', 'p1').attempts).toBe(1);
  await run(s, later(t0, 15));
  await run(s, later(t0, 30));
  expect(s.get('garmin_in', 'p1')).toMatchObject({ attempts: 3 });
  expect(s.get('garmin_in', 'p1').processedAt).toBeUndefined();
  expect(s.sent).toEqual([]);
  await run(s, later(t0, 75));
  const doc = s.get('garmin_in', 'p1');
  expect(doc.processedAt).toBeTruthy();
  expect(doc.result).toMatch(/^error:/);
  expect('sets' in doc).toBe(true); expect(doc.name).toBe('Viking Lower A');
  expect(s.sent.map((m) => m.text)).toEqual(['Couldn\'t read the Garmin session of Wed 25 Nov. Send me the sets, e.g. \'Lower A today: squat 3×5 at 110\', or ignore this.']);
  expect(await s.hasWork()).toBe(false);
  await run(s, later(t0, 90));
  expect(s.sent).toHaveLength(1);
});

it('engine: health seen without a plan change', async () => {
  const s = new MemoryStore({ workouts: { '2026-11-24_UA': wo('2026-11-24', 'UA') } });
  await run(s, T);
  expect((s.get('plan', 'current') as PlanCurrent).days[0]).toMatchObject({ date: '2026-11-25', kind: 'gym', session: 'LA' });
  s.ctx = { ...s.ctx, healthUpdatedAt: '2026-11-25T18:05:00Z', health: { hrvStatus: 'BALANCED', readiness: 75, sleepH: 7.5, bodyBattery: 60, sleepStress: 10 } };
  s.clock = new Date('2026-11-25T18:06:00Z');
  expect(await s.hasWork()).toBe(true);
  expect(await run(s, '2026-11-25T18:06:00Z')).toMatchObject({ rebuilt: true });
  expect(count(s, 'plan/current')).toBe(1);
  expect(count(s, 'plan/state')).toBe(2);
  expect((s.get('plan', 'state') as PlanState).healthSeenAt).toBe('2026-11-25T18:05:00Z');
  expect(await s.hasWork()).toBe(false);
  expect(await run(s, '2026-11-25T18:07:00Z')).toMatchObject({ rebuilt: false });
});

it('engine: fresh health rebuilds today and blocks a stale freeze', async () => {
  const s = new MemoryStore({ workouts: { '2026-11-24_LA': wo('2026-11-24', 'LA') } });
  const ok: Health = { hrvStatus: 'BALANCED', readiness: 75 };
  s.ctx = { ...s.ctx, wakeAt: { '2026-11-25': '2026-11-25T10:00:00Z' }, healthUpdatedAt: '2026-11-25T10:30:00Z', health: ok };
  await run(s, '2026-11-25T11:00:00Z');
  const h1 = (s.get('plan', 'current') as PlanCurrent).days[0];
  expect(h1).toMatchObject({ date: '2026-11-25', kind: 'ride', ride: { code: 'H1' } });
  // The routine mirrored the pre-health plan after wake; then fresh health says HRV LOW.
  s.set('plan', 'garmin', { '2026-11-25': { mirroredAt: '2026-11-25T11:30:00Z', hash: h1.garmin!.hash } });
  s.ctx = { ...s.ctx, healthUpdatedAt: '2026-11-25T12:00:00Z', health: { hrvStatus: 'LOW' } };
  await run(s, '2026-11-25T12:01:00Z');
  let st = s.get('plan', 'state') as PlanState;
  let d0 = (s.get('plan', 'current') as PlanCurrent).days[0];
  expect(d0).toMatchObject({ date: '2026-11-25', ride: { code: 'E1', from: 'H1', reason: 'readiness: HRV LOW' } });
  expect(st.frozen).toBeUndefined();
  expect(st.healthSeenAt).toBe('2026-11-25T12:00:00Z');
  // Once the E1 is mirrored (health seen), the freeze is taken and holds against later readiness.
  s.set('plan', 'garmin', { '2026-11-25': { mirroredAt: '2026-11-25T12:10:00Z', hash: d0.garmin!.hash } });
  await run(s, '2026-11-25T12:15:00Z');
  st = s.get('plan', 'state') as PlanState;
  expect(st.frozen).toMatchObject({ date: '2026-11-25', day: { ride: { code: 'E1' } } });
  s.ctx = { ...s.ctx, healthUpdatedAt: '2026-11-25T13:00:00Z', health: ok };
  await run(s, '2026-11-25T13:01:00Z');
  d0 = (s.get('plan', 'current') as PlanCurrent).days[0];
  expect(d0.ride?.code).toBe('E1');
});

it('engine: a gated tick never loads', async () => {
  const s = new MemoryStore();
  await run(s, T);
  const loads = s.loads;
  expect(await run(s, '2026-11-25T18:07:00Z')).toEqual({ imported: 0, ticks: 0, rebuilt: false, calendarOps: 0 });
  expect(s.loads).toBe(loads);
  // The vr: confirm button clears the hash: that is work, so the next minute rebuilds.
  s.set('plan', 'current', { ...s.get('plan', 'current'), hash: '' });
  expect(await run(s, '2026-11-25T18:08:00Z')).toMatchObject({ rebuilt: true });
  expect(s.loads).toBe(loads + 1);
});

it('engine: a ride or settle write error keeps plan/state and resumes next run', async () => {
  const s = new MemoryStore({
    cycle: { '2026-11-23_auto_7': { date: '2026-11-23', day: 7, status: 'skip', savedAt: 1 } },
    rides: { r25: { date: '2026-11-25', type: 'easy', minutes: 30 } },
  });
  s.set('plan', 'state', { since: '2026-11-22', settledThrough: '2026-11-22', slidDates: [], ridesSeen: [], resets: {}, suggestions: [], blocks: {} });
  s.failOnce('cycle'); // the day-8 tick on 24 Nov
  await run(s, T, '2026-11-22');
  let st = s.get('plan', 'state') as PlanState;
  expect(count(s, 'plan/state')).toBe(1);
  expect(st.settledThrough).toBe('2026-11-23'); // 23 Nov settled (already ticked), 24 Nov not
  expect(st.ridesSeen).toEqual([]); // the stream stopped before the 25 Nov ride
  expect(s.all('cycle')['2026-11-24_auto_8']).toBeUndefined();
  await run(s, later(T, 15), '2026-11-22');
  st = s.get('plan', 'state') as PlanState;
  expect(s.all('cycle')['2026-11-24_auto_8']).toMatchObject({ status: 'done' });
  expect(st.settledThrough).toBe('2026-11-24');
  expect(st.ridesSeen).toEqual(['r25']);
});

it('engine: a slid date that now has a tick (viking_fix) is dropped from slidDates', async () => {
  const s = new MemoryStore({
    workouts: { '2026-11-22_LB': LB22 },
    cycle: { '2026-11-23_auto_6': { date: '2026-11-23', day: 6, status: 'done', savedAt: 1 } },
  });
  s.set('plan', 'state', { since: '2026-11-21', settledThrough: '2026-11-24', slidDates: ['2026-11-21', '2026-11-23'], ridesSeen: [], resets: {}, suggestions: [], blocks: {} });
  await run(s, T, '2026-11-21');
  expect((s.get('plan', 'state') as PlanState).slidDates).toEqual(['2026-11-21']);
});

it('engine: before-since activity is marked processed, not imported', async () => {
  const s = new MemoryStore();
  s.inbox(UB);
  expect(await run(s, T)).toMatchObject({ imported: 0, ticks: 0 });
  expect(s.get('garmin_in', UB.activityId)).toMatchObject({ result: 'before switch-on' });
  expect(s.get('garmin_in', UB.activityId).processedAt).toBeTruthy();
  expect(s.all('workouts')).toEqual({});
  expect(s.claims.size).toBe(0);
  expect(s.sent).toEqual([]);
});

it('engine: today\'s snapshot is not overwritten after today is logged', async () => {
  const s = new MemoryStore({ workouts: { '2026-11-24_UA': wo('2026-11-24', 'UA') } });
  await run(s, '2026-11-25T11:00:00Z');
  const snap = s.get('plan', '2026-11-25');
  expect(snap).toMatchObject({ date: '2026-11-25', session: 'LA' });
  expect(snap.targets.squat).toBeDefined();
  expect(snap.garmin).toBeUndefined();
  s.inbox(LA);
  await run(s, T);
  expect(s.get('workouts', '2026-11-25_LA')).toBeDefined();
  await run(s, later(T, 15));
  expect(s.get('plan', '2026-11-25')).toEqual(snap);
  expect(count(s, 'plan/2026-11-25')).toBe(1);
});

it('engine: a decision doc is folded once', async () => {
  const s = new MemoryStore({ workouts: { '2026-11-24_UA': wo('2026-11-24', 'UA') } });
  const sug = { id: 'squat-2026-11-20', kind: 'reset', ex: 'squat', kg: 100, status: 'pending', createdAt: '2026-11-20T12:00:00.000Z' };
  s.set('plan', 'state', { since: '2026-11-24', settledThrough: '2026-11-24', slidDates: [], ridesSeen: [], resets: {}, suggestions: [sug], blocks: {} });
  s.set('plan', 'decision-squat-2026-11-20', { status: 'ok', decidedAt: '2026-11-25T17:00:00.000Z' });
  await run(s, T);
  let st = s.get('plan', 'state') as PlanState;
  expect(st.suggestions).toEqual([{ ...sug, status: 'ok', decidedAt: '2026-11-25T17:00:00.000Z' }]);
  expect(st.resets).toEqual({ squat: '2026-11-25T17:00:00.000Z' });
  const la = (s.get('plan', 'current') as PlanCurrent).days.find((d) => d.session === 'LA')!;
  expect(la.targets!.squat.kg).toBe(100);
  s.set('plan', 'decision-squat-2026-11-20', { status: 'no', decidedAt: '2026-11-25T18:10:00.000Z' });
  await run(s, later(T, 15));
  st = s.get('plan', 'state') as PlanState;
  expect(st.suggestions[0]).toMatchObject({ status: 'ok', decidedAt: '2026-11-25T17:00:00.000Z' });
  expect(st.resets).toEqual({ squat: '2026-11-25T17:00:00.000Z' });
  expect(s.sent).toEqual([]);
});

it('engine: retired calendar blocks are removed once, and none are made', async () => {
  const s = new MemoryStore({ workouts: { '2026-11-24_UA': wo('2026-11-24', 'UA') } });
  s.set('plan', 'state', { since: '2026-11-24', settledThrough: '2026-11-24', slidDates: [], ridesSeen: [], resets: {}, suggestions: [], blocks: {
    '2026-11-26': { eventId: 'ev1', key: 'ride:E1:85', start: '2026-11-26T10:30:00.000Z', end: '2026-11-26T11:55:00.000Z' },
    '2026-11-27': { eventId: 'ev2', key: 'gym:UB:60', start: '2026-11-27T12:00:00.000Z', end: '2026-11-27T13:00:00.000Z' },
  } });
  const calls: string[] = [];
  s.calendar = { remove: async (id: string) => { calls.push(id); } };
  expect((await run(s, T)).calendarOps).toBe(2);
  expect(calls).toEqual(['ev1', 'ev2']);
  expect((s.get('plan', 'state') as PlanState).blocks).toEqual({});
  expect((await run(s, later(T, 15))).calendarOps).toBe(0);
  expect(calls).toHaveLength(2);
});

it('engine: a block whose removal fails stays and is retried next tick', async () => {
  const s = new MemoryStore({ workouts: { '2026-11-24_UA': wo('2026-11-24', 'UA') } });
  s.set('plan', 'state', { since: '2026-11-24', settledThrough: '2026-11-24', slidDates: [], ridesSeen: [], resets: {}, suggestions: [], blocks: {
    '2026-11-27': { eventId: 'ev2', key: 'gym:UB:60', start: '2026-11-27T12:00:00.000Z', end: '2026-11-27T13:00:00.000Z' },
  } });
  let fail = true;
  s.calendar = { remove: async () => { if (fail) throw new Error('bridge down'); } };
  expect((await run(s, T)).calendarOps).toBe(0);
  expect(Object.keys((s.get('plan', 'state') as PlanState).blocks)).toEqual(['2026-11-27']);
  fail = false;
  expect((await run(s, later(T, 15))).calendarOps).toBe(1);
  expect((s.get('plan', 'state') as PlanState).blocks).toEqual({});
});
});

const tk = (date: string, day: number, status: CycleDoc['status'] = 'done', savedAt = 1): Record<string, CycleDoc> =>
  ({ [`${date}_auto_${day}`]: { date, day, status, savedAt } });
const st0 = (settledThrough: string, o: Partial<PlanState> = {}): PlanState =>
  ({ since: '2026-11-20', settledThrough, slidDates: [], ridesSeen: [], resets: {}, suggestions: [], blocks: {}, ...o });
const at = (fx: GarminIn, date: string, activityId: string, hm = '07:00'): GarminIn =>
  ({ ...fx, activityId, date, start: `${date}T${hm}`, startUtc: `${date}T11:00:00Z`, insertedAt: `${date}T20:00:00Z` });
const plan = (s: MemoryStore) => s.get('plan', 'current') as PlanCurrent;
const swaps = (s: MemoryStore) => s.sent.filter((m) => m.text.startsWith('↔️ You rode'));

describe('viking engine: swaps', () => {
afterEach(() => { vi.restoreAllMocks(); });

it('engine: live 27–29 Nov scenario', async () => {
  const s = new MemoryStore({
    workouts: { '2026-11-22_LB': LB22 },
    cycle: { ...tk('2026-11-24', 1), ...tk('2026-11-25', 2) },
  });
  s.inbox(at(UB, '2026-11-27', 'ub27'));
  await run(s, '2026-11-27T18:00:00Z');
  expect(s.get('cycle', '2026-11-27_auto_4')).toMatchObject({ day: 4, status: 'done' });
  const [m] = recaps(s);
  expect(m.text).toContain('Upper B');
  expect(m.text).toContain('↔️ Swapped: Hard ride moves to tomorrow.');
  expect(m.text).not.toContain('New lap');
  const skip = m.kb!.filter((row) => row[0].data.startsWith('vks:'));
  expect(skip).toEqual([[{ text: '✖️ Skip Hard ride', data: 'vks:ub27:3' }]]);
  expect(m.kb![0][0].data.startsWith('vr:')).toBe(true); // confirm rows first, then skip rows
  let days = plan(s).days;
  expect(days[0]).toMatchObject({ date: '2026-11-28', cycleDay: 3, kind: 'ride' });
  expect(days[1]).toMatchObject({ date: '2026-11-29', cycleDay: 5, session: 'LB' });
  expect(days.filter((d) => d.session === 'UB')).toEqual([]);

  // The 28 Nov ride ticks box 3 (the first open box); 29 Nov is Lower B.
  s.set('rides', 'r28', { date: '2026-11-28', code: 'H1', type: 'hard', minutes: 60 });
  await run(s, '2026-11-29T13:00:00Z');
  expect(s.get('cycle', '2026-11-28_auto_3')).toMatchObject({ day: 3, status: 'done' });
  days = plan(s).days;
  expect(days[0]).toMatchObject({ date: '2026-11-29', cycleDay: 5, session: 'LB' });
  expect(days.filter((d) => d.session === 'UB')).toEqual([]);
  expect(plan(s).cycleDay).toBe(5);
  expect(swaps(s)).toEqual([]);
});

const rideFirst = () => {
  const s = new MemoryStore({
    cycle: tk('2026-11-24', 1),
    rides: { r25: { date: '2026-11-25', type: 'easy', minutes: 50 } },
  });
  s.set('plan', 'state', st0('2026-11-24'));
  return s;
};

it('engine: ride-first swap waits for delivery, then sends once', async () => {
  const s = rideFirst();
  expect(await run(s, '2026-11-26T12:00:00Z')).toMatchObject({ ticks: 0 });
  expect(s.all('cycle')).toEqual(tk('2026-11-24', 1));
  expect((s.get('plan', 'state') as PlanState).settledThrough).toBe('2026-11-24');
  expect((s.get('plan', 'state') as PlanState).slidDates).toEqual([]);
  expect(s.sent).toEqual([]);
  // A mirror before the end of 25 Nov (local) proves nothing; one after it does.
  s.set('plan', 'garmin', { '2026-11-25': { mirroredAt: '2026-11-26T03:59:00Z', hash: '' } });
  await run(s, '2026-11-26T12:15:00Z');
  expect(s.all('cycle')).toEqual(tk('2026-11-24', 1));
  s.set('plan', 'garmin', { '2026-11-25': { mirroredAt: '2026-11-26T05:00:00Z', hash: '' } });
  expect(await run(s, '2026-11-26T12:30:00Z')).toMatchObject({ ticks: 1 });
  expect(s.get('cycle', '2026-11-25_auto_6')).toMatchObject({ day: 6, status: 'done' });
  expect((s.get('plan', 'state') as PlanState).settledThrough).toBe('2026-11-25');
  expect(swaps(s)).toEqual([{
    text: '↔️ You rode on Wed 25 Nov instead of Lower A: the ride counts as day 6, and Lower A is next.',
    kb: [[{ text: '✖️ Skip Lower A', data: 'vks:r2026-11-25:2' }]],
  }]);
  expect(s.claims.has('vkswap:r2026-11-25')).toBe(true);
  expect(plan(s).days[0]).toMatchObject({ date: '2026-11-26', session: 'LA' });
  await run(s, '2026-11-26T12:45:00Z');
  expect(swaps(s)).toHaveLength(1);
});

it('engine: a later garmin_in proves delivery', async () => {
  const s = rideFirst();
  await run(s, '2026-11-26T12:00:00Z');
  expect(s.all('cycle')).toEqual(tk('2026-11-24', 1));
  s.inbox({ ...at(UA, '2026-11-26', 'x26'), name: 'Morning stretch', sets: [], insertedAt: '2026-11-26T12:05:00Z' });
  await run(s, '2026-11-26T12:15:00Z');
  expect(s.get('cycle', '2026-11-25_auto_6')).toBeDefined();
  expect(swaps(s)).toHaveLength(1);
});

it('engine: a failed ride-swap send never blocks the tick', async () => {
  const s = rideFirst();
  s.set('plan', 'garmin', { '2026-11-25': { mirroredAt: '2026-11-26T05:00:00Z', hash: '' } });
  s.failSend = true;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  expect(await run(s, '2026-11-26T12:00:00Z')).toMatchObject({ ticks: 1, rebuilt: true });
  expect((s.get('plan', 'state') as PlanState).settledThrough).toBe('2026-11-25');
  s.failSend = false;
  await run(s, '2026-11-26T12:15:00Z');
  expect(swaps(s)).toEqual([]);
});

it('engine: late gym import within the wait wins over the ride swap', async () => {
  const s = rideFirst();
  await run(s, '2026-11-26T12:00:00Z');
  expect(s.all('cycle')).toEqual(tk('2026-11-24', 1));
  s.inbox({ ...LA, insertedAt: '2026-11-26T03:00:00Z' }); // dated 25 Nov: not proof of delivery
  await run(s, '2026-11-26T12:15:00Z');
  expect(Object.keys(s.all('cycle')).sort()).toEqual(['2026-11-24_auto_1', '2026-11-25_auto_2']);
  expect(recaps(s)).toHaveLength(1);
  expect(recaps(s)[0].text).not.toContain('Swapped');
  expect(swaps(s)).toEqual([]);
  expect((s.get('plan', 'state') as PlanState).settledThrough).toBe('2026-11-25');
});

it('engine: wait is capped at 12 h', async () => {
  const s = rideFirst();
  const logs: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')); });
  // The end of 25 Nov in Aruba is 26 Nov 04:00Z; the cap is 16:00Z.
  await run(s, '2026-11-26T15:59:00Z');
  expect(s.all('cycle')).toEqual(tk('2026-11-24', 1));
  expect(logs).toEqual([]);
  await run(s, '2026-11-26T16:00:00Z');
  expect(s.get('cycle', '2026-11-25_auto_6')).toBeDefined();
  expect(logs).toEqual(['[viking] ride-swap wait capped 2026-11-25']);
  expect(swaps(s)).toHaveLength(1);
});

it('engine: items after a waiting date wait too', async () => {
  const s = rideFirst();
  s.set('rides', 'r26', { date: '2026-11-26', type: 'easy', minutes: 30 });
  await run(s, '2026-11-26T12:00:00Z');
  expect((s.get('plan', 'state') as PlanState).ridesSeen).toEqual(['r25']);
});

it('engine: drops expired and filled pins', async () => {
  const s = new MemoryStore({ cycle: { ...tk('2026-11-24', 1), ...tk('2026-11-25', 2), ...tk('2026-11-26', 3) } });
  s.set('plan', 'state', st0('2026-11-25'));
  s.set('plan', 'pins', {
    '2026-11-23': 5,   // expired
    '2026-11-26': 0,   // a day off he trained on anyway (a tick on that date)
    '2026-11-27': 1,   // Upper A is already done this lap
    '2026-11-28': 5,   // still good
  });
  await run(s, '2026-11-26T18:00:00Z');
  expect(s.unpins).toEqual([['2026-11-23', '2026-11-26', '2026-11-27']]);
  expect(s.get('plan', 'pins')).toEqual({ '2026-11-28': 5 });
  const days = plan(s).days;
  expect(days[0]).toMatchObject({ date: '2026-11-27', session: 'UB' });
  expect(days[1]).toMatchObject({ date: '2026-11-28', session: 'LB' });
  await run(s, '2026-11-26T18:15:00Z');
  expect(s.unpins).toHaveLength(1);
});

it('engine: a past pin waits until its date is settled', async () => {
  const s = new MemoryStore({ cycle: tk('2026-11-23', 7, 'skip') });
  s.set('plan', 'state', st0('2026-11-23'));
  s.set('plan', 'pins', { '2026-11-25': 0 });
  s.failOnce('cycle'); // the day-8 tick on 24 Nov: the stream stops before 25 Nov
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await run(s, '2026-11-26T12:00:00Z');
  expect((s.get('plan', 'state') as PlanState).settledThrough).toBe('2026-11-23');
  expect(s.unpins).toEqual([]);
  await run(s, '2026-11-26T12:15:00Z');
  const st = s.get('plan', 'state') as PlanState;
  expect(st.settledThrough).toBe('2026-11-25');
  expect(st.slidDates).toEqual([]); // 25 Nov settled as the day off
  expect(s.unpins).toEqual([['2026-11-25']]);
});

it('engine: a pin for the next lap is kept while the plan places it', async () => {
  const cycle = Object.assign({}, ...[1, 2, 3, 4, 5, 6].map((d) => tk(`2026-11-${19 + d}`, d)));
  const s = new MemoryStore({ cycle });
  s.set('plan', 'state', st0('2026-11-25'));
  // Days 7 and 8 are left (27, 28 Nov); the new lap's Upper A pinned to 30 Nov.
  s.set('plan', 'pins', { '2026-11-30': 1 });
  await run(s, '2026-11-26T18:00:00Z');
  expect(s.unpins).toEqual([]);
  expect(plan(s).days.find((d) => d.date === '2026-11-30')).toMatchObject({ session: 'UA' });
});

it('engine: a pin reaches every tick call', async () => {
  // Upper B pinned to 26 Nov with the hard ride still open: Upper B that day is not a swap.
  const s = new MemoryStore({ cycle: { ...tk('2026-11-24', 1), ...tk('2026-11-25', 2) } });
  s.set('plan', 'state', st0('2026-11-25'));
  s.set('plan', 'pins', { '2026-11-26': 4 });
  s.inbox(at(UB, '2026-11-26', 'ub26'));
  await run(s, '2026-11-26T18:00:00Z');
  expect(s.get('cycle', '2026-11-26_auto_4')).toBeDefined();
  const [m] = recaps(s);
  expect(m.text).not.toContain('Swapped');
  expect(m.text).not.toContain('New lap');
  expect(m.kb?.some((row) => row[0].data.startsWith('vks:')) ?? false).toBe(false);
  expect(plan(s).days[0]).toMatchObject({ date: '2026-11-27', cycleDay: 3 });
});

it('engine: day off is not a slid date', async () => {
  const s = new MemoryStore({ workouts: { '2026-11-22_LB': LB22 }, cycle: tk('2026-11-24', 1) });
  s.set('plan', 'state', st0('2026-11-24'));
  s.set('plan', 'pins', { '2026-11-25': 0 });
  await run(s, '2026-11-26T12:00:00Z');
  let st = s.get('plan', 'state') as PlanState;
  expect(st.settledThrough).toBe('2026-11-25');
  expect(st.slidDates).toEqual([]);
  expect(s.all('cycle')).toEqual(tk('2026-11-24', 1));
  expect(s.unpins).toEqual([['2026-11-25']]);
  // Without the pin, the same day slides.
  const s2 = new MemoryStore({ workouts: { '2026-11-22_LB': LB22 }, cycle: tk('2026-11-24', 1) });
  s2.set('plan', 'state', st0('2026-11-24'));
  await run(s2, '2026-11-26T12:00:00Z');
  st = s2.get('plan', 'state') as PlanState;
  expect(st.slidDates).toEqual(['2026-11-25']);
});

it('engine: a day-off pin ahead plans rest and the lap moves back a day', async () => {
  const s = new MemoryStore({ cycle: { ...tk('2026-11-24', 1), ...tk('2026-11-25', 2) } });
  s.set('plan', 'state', st0('2026-11-25'));
  s.set('plan', 'pins', { '2026-11-27': 0 });
  await run(s, '2026-11-26T12:00:00Z');
  const days = plan(s).days;
  expect(days[0]).toMatchObject({ date: '2026-11-26', cycleDay: 3 });
  expect(days[1]).toMatchObject({ date: '2026-11-27', cycleDay: 0, kind: 'rest', reason: 'day off' });
  expect(days[2]).toMatchObject({ date: '2026-11-28', session: 'UB' });
});

it('engine: new lap recap names the passed days', async () => {
  const s = new MemoryStore({ cycle: { ...tk('2026-11-24', 1), ...tk('2026-11-25', 2), ...tk('2026-11-26', 4) } });
  s.set('plan', 'state', st0('2026-11-26'));
  s.inbox(at(UA, '2026-11-27', 'ua27'));
  await run(s, '2026-11-27T18:00:00Z');
  const [m] = recaps(s);
  expect(m.text).toContain('🔄 New lap: Upper A started it, so Hard ride, Lower B, Endurance ride and 2 more were passed.');
  expect(m.text).not.toContain('Swapped');
  expect(m.kb?.some((row) => row[0].data.startsWith('vks:')) ?? false).toBe(false);
  expect(plan(s).days[0]).toMatchObject({ date: '2026-11-28', session: 'LA' });
});
});
