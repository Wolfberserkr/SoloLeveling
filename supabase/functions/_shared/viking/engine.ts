// Project Viking — the life-bot tick: import Garmin sessions, settle finished
// days, fold decisions, rebuild the plan (and clear any retired calendar blocks). Pure TS:
// every read and write goes through the injected VikingStore; time is passed in.
import { bike } from './bikeLogic.ts';
import type { SessionKey } from './data.ts';
import { hashOf } from './garmin.ts';
import { importStrength, type GarminIn } from './garminImport.ts';
import { viking, type CycleDoc, type RideDoc, type VikingData } from './logic.ts';
import { endOfDay, gymTick, planAhead, rideTick, type Health, type PlanCurrent, type PlanDay } from './planner.ts';
import { nextTargets, type Overrides, type Progress, type Resets } from './targets.ts';
import { suggestionsFor, weekSummary, type Suggestion } from './weekly.ts';
import {
  confirmKeyboard, notVikingText, poisonText, recapText, resultFromDoc, suggestionKeyboard, suggestionText,
  type Keyboard,
} from './recap.ts';
import { addDays, localParts } from '../lifeLogic.ts';

export interface VikingStore {
  load(): Promise<{ D: VikingData; current: PlanCurrent | null; state: PlanState | null; garmin: Record<string, { mirroredAt: string; hash: string }>; inbox: GarminIn[]; snapshots: Record<string, { session?: SessionKey; targets?: Record<string, Progress> }>; decisions: Record<string, { status: 'ok' | 'no'; decidedAt: string }> }>;
  hasWork(): Promise<boolean>;                       // a retry-ready garmin_in (no processedAt; no lastFailedAt or 15+ min since it), rides updated in the last 10 min, today's life_health.updated_at > plan/state.healthSeenAt, or plan/current is missing or its hash is empty
  put(coll: string, id: string, data: unknown): Promise<void>;
  merge(coll: string, id: string, patch: Record<string, unknown>): Promise<void>; // data = data || patch
  claim(key: string): Promise<boolean>;              // life_nudge_log insert; false if taken
  release(key: string): Promise<void>;               // delete that life_nudge_log key (life-bot may delete; the no-DELETE rule is for routines)
  send(text: string, kb?: Keyboard | null): Promise<void>;
  context(today: string): Promise<{ afterNight: Set<string>; health?: Health; healthUpdatedAt?: string; windows: Record<string, string>; wakeAt: Record<string, string> }>;
  calendar: null | { remove(id: string): Promise<void> };  // only to clear training blocks made before they were retired
}
export type PlanState = { since: string; settledThrough: string; healthSeenAt?: string; slidDates: string[]; ridesSeen: string[]; resets: Resets; suggestions: Suggestion[]; blocks: Record<string, BlockState>; frozen?: { date: string; day: PlanDay } };

/** A training block Jarvis put on Google Calendar (retired; kept so old ones get removed). */
export type BlockState = { eventId: string; key: string; start: string; end: string };

type Inbox = GarminIn & { firstFailedAt?: string; lastFailedAt?: string };
type Item =
  | { key: string; kind: 'activity'; a: Inbox }
  | { key: string; kind: 'ride'; id: string; date: string }
  | { key: string; kind: 'eod'; date: string };

const MIN = 60_000;
const RETRY_MS = 15 * MIN;
const POISON_MS = 60 * MIN;
const POISON_TRIES = 3;
const KEEP_RIDES = 60;
const KEEP_SLID = 30;

/** "2026-11-25T06:11" or "6:11" → "06:11". */
function hm(s: string | undefined, dflt: string): string {
  const m = /(\d{1,2}):(\d{2})/.exec(s?.includes('T') ? s.split('T')[1] : s ?? '');
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : dflt;
}
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const log = (...a: unknown[]) => console.log('[viking]', ...a);

export async function runVikingTick(
  s: VikingStore, now: Date, tz: string, since: string,
): Promise<{ imported: number; ticks: number; rebuilt: boolean; calendarOps: number }> {
  const out = { imported: 0, ticks: 0, rebuilt: false, calendarOps: 0 };
  const lp = localParts(now, tz);
  const today = lp.date, yesterday = addDays(today, -1);
  const on15 = lp.minute % 15 === 0;
  const nowIso = now.toISOString(), nowMs = now.getTime();

  // 1–2. Gate and load.
  // A cleared plan/current hash counts as work (hasWork), so the gate needs no load.
  if (!(await s.hasWork()) && !on15) return out;
  const L = await s.load();
  const D = L.D;
  if (!D.settings) return out;

  const loadedSeen = L.state?.healthSeenAt;
  const state: PlanState = L.state
    ? {
      ...L.state, suggestions: [...L.state.suggestions], resets: { ...L.state.resets },
      // A date that has a tick now (viking_fix may write one directly) is no longer slid.
      slidDates: L.state.slidDates.filter((d) => !Object.values(D.cycle).some((t) => t.date === d)),
    }
    : { since, settledThrough: yesterday, slidDates: [], ridesSeen: [], resets: {}, suggestions: [], blocks: {} };
  for (const [id, d] of Object.entries(L.decisions)) {
    const i = state.suggestions.findIndex((x) => x.id === id);
    if (i < 0 || state.suggestions[i].status !== 'pending') continue; // unknown or already folded
    const sg = state.suggestions[i];
    if (d.status === 'ok') {
      state.suggestions[i] = { ...sg, status: 'ok', decidedAt: d.decidedAt };
      state.resets[sg.ex] = d.decidedAt;
    } else {
      const count = Object.values(D.workouts).filter((w) => w.entries?.some((e) => e.ex === sg.ex)).length;
      state.suggestions[i] = { ...sg, status: 'no', decidedAt: d.decidedAt, snoozeUntil: count + 3 };
    }
  }
  const overrides = (): Overrides =>
    ({ kg: Object.fromEntries(state.suggestions.filter((x) => x.status === 'ok').map((x) => [x.ex, x.kg])) });
  /** Targets for the session's next occurrence (one cycle on). */
  const targetsAt = (DD: VikingData, sk: SessionKey, date: string) =>
    nextTargets(viking(DD), sk, addDays(date, 8), overrides(), state.resets);
  const tickPut = async (t: { id: string; doc: CycleDoc }) => {
    await s.put('cycle', t.id, t.doc);
    D.cycle[t.id] = t.doc;
    state.slidDates = state.slidDates.filter((x) => x !== t.doc.date);
    out.ticks++;
  };

  // 3. One stream in date order: activities, new rides, finished days.
  const items: Item[] = [];
  for (const a of L.inbox as Inbox[]) {
    if (a.processedAt) continue;
    if (a.date < since) {
      await s.put('garmin_in', a.activityId, { ...a, processedAt: nowIso, result: 'before switch-on' });
      continue;
    }
    items.push({ key: `${a.date}T${hm(a.start, '00:00')}`, kind: 'activity', a });
  }
  const rideFrom = since > addDays(today, -7) ? since : addDays(today, -7);
  for (const [id, r] of Object.entries(D.rides) as Array<[string, RideDoc & { start?: string }]>)
    if (r.date >= rideFrom && r.date <= today && !state.ridesSeen.includes(id))
      items.push({ key: `${r.date}T${hm(r.start, '23:58')}`, kind: 'ride', id, date: r.date });
  for (let d = addDays(state.settledThrough, 1); d <= yesterday; d = addDays(d, 1))
    items.push({ key: `${d}T23:59`, kind: 'eod', date: d });
  items.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));

  let i = 0;
  for (const it of items) {
    const savedAt = nowMs + ++i;
    if (it.kind === 'ride' || it.kind === 'eod') {
      // On a write error, stop the stream: plan/state still saves what was
      // processed, and the next tick picks up from the failed item.
      try {
        if (it.kind === 'ride') {
          const t = rideTick(D, it.date, savedAt);
          if (t) await tickPut(t);
          state.ridesSeen = [...state.ridesSeen, it.id].slice(-KEEP_RIDES);
        } else {
          const r = endOfDay(D, it.date, savedAt);
          if (r === 'slid') state.slidDates = [...state.slidDates.filter((x) => x !== it.date), it.date].slice(-KEEP_SLID);
          else if (r === 'wait') break; // delivered is always true until the engine learns to wait
          else if (r && r !== 'off') await tickPut(r);
          state.settledThrough = it.date;
        }
      } catch (e) {
        log(`${it.kind} ${it.date} failed; stream stopped until the next tick`, msg(e));
        break;
      }
      continue;
    }

    const a = it.a, id = a.activityId;
    if (a.lastFailedAt && nowMs - Date.parse(a.lastFailedAt) < RETRY_MS) continue; // before any claim
    if (!(await s.claim('vkimp:' + id))) continue;
    let recap: { text: string; kb: Keyboard | null } | null = null;
    try {
      const planned = L.snapshots[a.date]?.targets ?? null;
      const res = importStrength(a, D, planned, savedAt);
      if ('skip' in res && res.skip === 'already') {
        // A retry after a failed write: finish the tick, processedAt and recap.
        const doc = D.workouts[res.docId];
        const t = gymTick(D, a.date, doc.session, savedAt);
        if (t) await tickPut(t);
        await s.put('garmin_in', id, { ...a, processedAt: nowIso, result: res.docId, dropped: res.dropped });
        out.imported++;
        const r = resultFromDoc(doc, res.docId, doc.session, planned, D, res.dropped);
        const without: VikingData = { ...D, workouts: { ...D.workouts } };
        delete without.workouts[res.docId];
        recap = { text: recapText(r, targetsAt(without, doc.session, a.date), targetsAt(D, doc.session, a.date), !!t?.newLap), kb: confirmKeyboard(r, id) };
      } else if ('skip' in res) {
        await s.put('garmin_in', id, { ...a, processedAt: nowIso, result: res.skip });
        if (res.skip === 'not-viking') recap = { text: notVikingText(a.name, a.date), kb: null };
      } else {
        const before = targetsAt(D, res.session, a.date);
        await s.put('workouts', res.docId, res.doc);
        D.workouts[res.docId] = res.doc;
        const t = gymTick(D, a.date, res.session, savedAt);
        if (t) await tickPut(t);
        await s.put('garmin_in', id, { ...a, processedAt: nowIso, result: res.docId, dropped: res.dropped });
        out.imported++;
        recap = { text: recapText(res, before, targetsAt(D, res.session, a.date), !!t?.newLap), kb: confirmKeyboard(res, id) };
      }
    } catch (e) {
      const attempts = (a.attempts ?? 0) + 1, first = a.firstFailedAt ?? nowIso;
      try { await s.merge('garmin_in', id, { attempts, firstFailedAt: first, lastFailedAt: nowIso }); } catch (e2) { log(`garmin_in ${id}: failure not recorded`, msg(e2)); }
      try { await s.release('vkimp:' + id); } catch (e2) { log(`vkimp:${id} not released`, msg(e2)); }
      if (attempts >= POISON_TRIES && nowMs - Date.parse(first) >= POISON_MS) {
        let gaveUp = false;
        try { await s.merge('garmin_in', id, { processedAt: nowIso, result: `error: ${msg(e)}` }); gaveUp = true; } catch (e2) { log(`garmin_in ${id}: give-up not recorded`, msg(e2)); }
        if (gaveUp) try { if (await s.claim('vkerr:' + id)) await s.send(poisonText(a.date)); } catch (e2) { log(`error message for ${id} lost`, msg(e2)); }
      }
      log(`import ${id} failed (attempt ${attempts})`, msg(e));
      continue;
    }
    if (recap) {
      try { if (await s.claim('vkrecap:' + id)) await s.send(recap.text, recap.kb); } catch (e) { log(`recap lost for ${id}; owner can use viking_status/viking_fix`, msg(e)); }
    }
  }

  // 4. Suggestions: ask about each new stall once.
  const known = new Set(state.suggestions.map((x) => x.id));
  state.suggestions = suggestionsFor(D, state.suggestions, state.resets, nowIso, today);
  for (const sg of state.suggestions) {
    if (sg.status !== 'pending' || known.has(sg.id)) continue;
    try { if (await s.claim('vksug:' + sg.id)) await s.send(suggestionText(sg), suggestionKeyboard(sg)); } catch (e) { log(`suggestion ${sg.id} not sent`, msg(e)); }
  }

  // 5. Rebuild.
  out.rebuilt = true;
  const cx = await s.context(today);
  const v = viking(D);
  const cur = bike(v).current().day;
  if (state.frozen && state.frozen.date !== today) delete state.frozen;
  if (!(state.frozen && state.frozen.day.cycleDay === cur)) {
    const g = L.garmin[today], wake = cx.wakeAt[today];
    const day = L.current?.days.find((d) => d.date === today);
    const seen = !cx.healthUpdatedAt || (!!loadedSeen && Date.parse(loadedSeen) >= Date.parse(cx.healthUpdatedAt));
    const onWatch = !!g && !!day && (g.hash === day.garmin?.hash || (!g.hash && !day.garmin));
    if (g && wake && day && day.cycleDay === cur && onWatch && seen && Date.parse(g.mirroredAt) >= Date.parse(wake))
      state.frozen = { date: today, day };
  }
  const days = planAhead(D, {
    today, afterNight: cx.afterNight, windows: cx.windows, health: cx.health,
    overrides: overrides(), resets: state.resets, frozen: state.frozen,
  });
  const pending = state.suggestions.filter((x) => x.status === 'pending');
  const hash = hashOf({ days, pending });
  const changed = hash !== L.current?.hash;
  if (changed) {
    const wk = v.weekOf(today);
    const pc: PlanCurrent = { builtAt: nowIso, date: today, week: wk, phase: v.phaseOf(today), deload: v.isDeloadWeek(wk), cycleDay: cur, hash, days, suggestions: pending };
    await s.put('plan', 'current', pc);
  }
  const todayLogged = Object.values(D.workouts).some((w) => w.date === today) || Object.values(D.cycle).some((t) => t.date === today);
  if (!todayLogged) {
    const d0 = days.find((d) => d.date === today);
    const snap = { date: today, ...(d0?.session ? { session: d0.session } : {}), ...(d0?.ride ? { ride: d0.ride } : {}), ...(d0?.targets ? { targets: d0.targets } : {}) };
    if (hashOf(snap) !== hashOf(L.snapshots[today] ?? null)) await s.put('plan', today, snap);
  }
  await s.put('plan', 'weekly', weekSummary(D, today, state.slidDates, state.resets));

  // 6. Calendar training blocks are retired: remove any made before, then nothing more.
  if (s.calendar && Object.keys(state.blocks ?? {}).length) out.calendarOps = await clearBlocks(s.calendar, state);
  if (cx.healthUpdatedAt) state.healthSeenAt = cx.healthUpdatedAt;
  await s.put('plan', 'state', state);
  return out;
}

/** Remove the training blocks still on the calendar; each one leaves state only once removed. */
async function clearBlocks(cal: NonNullable<VikingStore['calendar']>, state: PlanState): Promise<number> {
  let n = 0;
  for (const [d, b] of Object.entries(state.blocks)) {
    try { await cal.remove(b.eventId); delete state.blocks[d]; n++; } catch (e) { log(`block ${d} not removed`, msg(e)); }
  }
  return n;
}
