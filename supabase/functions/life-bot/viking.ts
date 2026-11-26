// ═════════════════════════════════════════════════════════════════════════
// Project Viking in life-bot: the Supabase-backed VikingStore the engine runs
// on, the tick lease around it, and the small doc helpers the buttons and the
// chat tools share. Everything here runs only with prefs.vikingGarmin === true.
// ═════════════════════════════════════════════════════════════════════════
import type { PlanState, VikingStore } from '../_shared/viking/engine.ts';
import { shortName, type GarminIn } from '../_shared/viking/garminImport.ts';
import { gymTick, type Health, type PlanCurrent, type PlanDay } from '../_shared/viking/planner.ts';
import { EXBY, ORDER, SESS, type SessionKey } from '../_shared/viking/data.ts';
import { RIDES } from '../_shared/viking/bikePlan.ts';
import { COLLS, emptyData, viking, type Coll, type SetEntry, type Settings, type VikingData, type WorkoutDoc } from '../_shared/viking/logic.ts';
import type { Progress } from '../_shared/viking/targets.ts';
import { addDays, localParts, zonedTime } from '../_shared/lifeLogic.ts';
import { bridge, gcalEnabled } from './calendar.ts';
import { sendMessage } from './telegram.ts';

// deno-lint-ignore no-explicit-any
type Db = any;
type Row = Record<string, unknown>;

const TABLE = 'viking_docs';
const PAGE = 1000;
const MIN = 60_000;
const RETRY_MS = 15 * MIN;
const RIDE_FRESH_MS = 10 * MIN;
const SNAPSHOT_DAYS = 14;
const DECISION_DAYS = 30;
const LEASE_KEY = 'vklease';
const LEASE_MS = 7 * MIN;
const MINUTE_KEEP_MS = 60 * MIN;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const fail = (what: string, error: { message?: string } | null | undefined) => {
  if (error) throw new Error(`${what}: ${error.message ?? String(error)}`);
};

/** The switch: everything new in life-bot runs only when this is exactly true. */
export const vikingOn = (prefs: unknown): boolean =>
  !!prefs && typeof prefs === 'object' && (prefs as Row).vikingGarmin === true;

// ── Docs ────────────────────────────────────────────────────────────────────

/** settings + COLLS, paged by 1000. */
export async function loadData(db: Db, userId: string): Promise<VikingData> {
  const D = emptyData();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(TABLE).select('coll,doc_id,data').eq('user_id', userId)
      .in('coll', ['settings', ...COLLS]).order('coll').order('doc_id').range(from, from + PAGE - 1);
    fail('viking_docs read failed', error);
    const rows = (data ?? []) as Row[];
    for (const r of rows) {
      if (r.coll === 'settings') D.settings = r.data as Settings;
      else (D[r.coll as Coll] as Record<string, unknown>)[String(r.doc_id)] = r.data;
    }
    if (rows.length < PAGE) break;
  }
  return D;
}

export async function getDoc<T = Row>(db: Db, userId: string, coll: string, id: string): Promise<T | null> {
  const { data, error } = await db.from(TABLE).select('data').eq('user_id', userId).eq('coll', coll).eq('doc_id', id).maybeSingle();
  fail(`${coll}/${id} read failed`, error);
  return data ? (data.data as T) : null;
}

export async function putDoc(db: Db, userId: string, coll: string, id: string, data: unknown): Promise<void> {
  const { error } = await db.from(TABLE).upsert(
    { user_id: userId, coll, doc_id: id, data, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,coll,doc_id' },
  );
  fail(`${coll}/${id} write failed`, error);
}

/** Insert a doc only if it doesn't exist yet. False when it already did. */
export async function createDoc(db: Db, userId: string, coll: string, id: string, data: unknown): Promise<boolean> {
  const { error } = await db.from(TABLE).insert({ user_id: userId, coll, doc_id: id, data, updated_at: new Date().toISOString() });
  if (!error) return true;
  if (error.code === '23505') return false;
  fail(`${coll}/${id} insert failed`, error);
  return false;
}

/**
 * data = data || patch. PostgREST can't express a jsonb concat, so this is a
 * read and a compare-and-set on updated_at (every writer of viking_docs bumps
 * it), retried on a lost race. A missing row is inserted when `insert` is set,
 * else left alone.
 */
export async function mergeDoc(db: Db, userId: string, coll: string, id: string, patch: Row, insert = true): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: row, error } = await db.from(TABLE).select('data,updated_at').eq('user_id', userId).eq('coll', coll).eq('doc_id', id).maybeSingle();
    fail(`${coll}/${id} read failed`, error);
    const stamp = new Date().toISOString();
    if (!row) {
      if (!insert) return false;
      const { error: e2 } = await db.from(TABLE).insert({ user_id: userId, coll, doc_id: id, data: patch, updated_at: stamp });
      if (!e2) return true;
      if (e2.code !== '23505') fail(`${coll}/${id} insert failed`, e2);
      continue; // someone created it meanwhile: merge into theirs
    }
    const { data: upd, error: e3 } = await db.from(TABLE).update({ data: { ...((row.data ?? {}) as Row), ...patch }, updated_at: stamp })
      .eq('user_id', userId).eq('coll', coll).eq('doc_id', id).eq('updated_at', row.updated_at).select('doc_id');
    fail(`${coll}/${id} update failed`, e3);
    if ((upd ?? []).length) return true;
  }
  throw new Error(`${coll}/${id}: merge kept losing to other writers`);
}

/** Ask the next tick to rebuild: only plan/current's hash changes, and only when the doc exists. */
export const clearPlanHash = (db: Db, userId: string): Promise<boolean> =>
  mergeDoc(db, userId, 'plan', 'current', { hash: null }, false);

async function claimKey(db: Db, userId: string, key: string, at?: string): Promise<boolean> {
  const { error } = await db.from('life_nudge_log').insert({ user_id: userId, key, ...(at ? { sent_at: at } : {}) });
  if (!error) return true;
  if (error.code !== '23505') console.error('life tick: viking claim failed', key, error);
  return false;
}

// ── The tick lease ──────────────────────────────────────────────────────────

/**
 * Runs `fn` at most once per UTC minute and never twice at once, so two
 * overlapping minute ticks can't run the engine concurrently.
 *  - `vktick:<UTC minute>`: a once-per-minute claim (a cron retry of the same
 *    minute is skipped). Kept an hour, then pruned here, so they don't pile up
 *    1440 a day until the 120-day cleanup.
 *  - `vklease`: one row while a run is in progress, deleted in `finally`. A
 *    row younger than 7 minutes means busy; an older one is a crashed run's
 *    leftover and is taken over by a compare-and-set on sent_at. 7 minutes is
 *    longer than Supabase's 400 s edge wall clock, so a live run is never taken over.
 * Both are plain life_nudge_log keys: no new table, and the existing PK makes
 * each claim atomic.
 */
export async function withVikingLease<T>(db: Db, userId: string, now: Date, fn: () => Promise<T>): Promise<T | null> {
  if (!(await claimKey(db, userId, `vktick:${now.toISOString().slice(0, 16)}`))) return null;
  const stamp = new Date().toISOString();
  let held = await claimKey(db, userId, LEASE_KEY, stamp);
  if (!held) {
    const { data, error } = await db.from('life_nudge_log').update({ sent_at: stamp }).eq('user_id', userId).eq('key', LEASE_KEY)
      .lt('sent_at', new Date(Date.parse(stamp) - LEASE_MS).toISOString()).select('key');
    if (error) console.error('life tick: viking lease takeover failed', error);
    held = !error && (data ?? []).length > 0;
  }
  if (!held) { console.log('[viking] previous tick still running; skipped'); return null; }
  try {
    return await fn();
  } finally {
    const { error } = await db.from('life_nudge_log').delete().eq('user_id', userId).eq('key', LEASE_KEY).eq('sent_at', stamp);
    if (error) console.error('life tick: viking lease not released', error);
    if (now.getUTCMinutes() % 15 === 0) {
      const { error: e2 } = await db.from('life_nudge_log').delete().eq('user_id', userId)
        .like('key', 'vktick:%').lt('sent_at', new Date(now.getTime() - MINUTE_KEEP_MS).toISOString());
      if (e2) console.error('life tick: old vktick keys not pruned', e2);
    }
  }
}

// ── The store ───────────────────────────────────────────────────────────────

const hm = (s: unknown) => (typeof s === 'string' ? s : '');
const numOr = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function healthOf(d: Row | undefined): Health | undefined {
  if (!d) return undefined;
  const h: Health = {};
  if (typeof d.hrvStatus === 'string') h.hrvStatus = d.hrvStatus;
  const readiness = numOr(d.readiness), sleepH = numOr(d.sleepH), bodyBattery = numOr(d.bodyBattery), sleepStress = numOr(d.sleepStress);
  if (readiness !== undefined) h.readiness = readiness;
  if (sleepH !== undefined) h.sleepH = sleepH;
  if (bodyBattery !== undefined) h.bodyBattery = bodyBattery;
  if (sleepStress !== undefined) h.sleepStress = sleepStress;
  return h;
}

export function supabaseStore(db: Db, userId: string, chatId: number, tz: string): VikingStore {
  const today = () => localParts(new Date(), tz).date;

  // Training blocks are retired; this only removes the ones made before that.
  const calendar: VikingStore['calendar'] = !gcalEnabled() ? null : {
    async remove(id: string) {
      await bridge.remove(id);
      await db.from('life_calendar_cache').delete().eq('user_id', userId).eq('event_id', id);
    },
  };


  return {
    calendar,

    async load() {
      const t = today();
      const [D, inboxR, planR, snapR, decR] = await Promise.all([
        loadData(db, userId),
        db.from(TABLE).select('doc_id,data').eq('user_id', userId).eq('coll', 'garmin_in').is('data->>processedAt', null),
        db.from(TABLE).select('doc_id,data').eq('user_id', userId).eq('coll', 'plan').in('doc_id', ['current', 'state', 'garmin', 'weekly']),
        db.from(TABLE).select('doc_id,data').eq('user_id', userId).eq('coll', 'plan').gte('doc_id', addDays(t, -SNAPSHOT_DAYS)).lte('doc_id', t),
        db.from(TABLE).select('doc_id,data').eq('user_id', userId).eq('coll', 'plan').like('doc_id', 'decision-%')
          .gt('updated_at', new Date(Date.now() - DECISION_DAYS * 86_400_000).toISOString()),
      ]);
      fail('garmin_in read failed', inboxR.error);
      fail('plan read failed', planR.error);
      fail('plan snapshots read failed', snapR.error);
      fail('plan decisions read failed', decR.error);

      const inbox = ((inboxR.data ?? []) as Row[])
        .map((r) => ({ ...(r.data as GarminIn), activityId: (r.data as GarminIn)?.activityId ?? String(r.doc_id) }))
        .sort((a, b) => (hm(a.start) < hm(b.start) ? -1 : hm(a.start) > hm(b.start) ? 1 : a.activityId < b.activityId ? -1 : 1));
      const plan = Object.fromEntries(((planR.data ?? []) as Row[]).map((r) => [String(r.doc_id), r.data]));
      const snapshots: Record<string, { session?: SessionKey; targets?: Record<string, Progress> }> = {};
      for (const r of (snapR.data ?? []) as Row[]) if (DATE_RE.test(String(r.doc_id))) snapshots[String(r.doc_id)] = r.data as never;
      const decisions: Record<string, { status: 'ok' | 'no'; decidedAt: string }> = {};
      for (const r of (decR.data ?? []) as Row[]) {
        const d = r.data as { status?: string; decidedAt?: string } | null;
        if (d && (d.status === 'ok' || d.status === 'no') && typeof d.decidedAt === 'string')
          decisions[String(r.doc_id).slice('decision-'.length)] = { status: d.status, decidedAt: d.decidedAt };
      }
      return {
        D,
        current: (plan.current ?? null) as PlanCurrent | null,
        state: (plan.state ?? null) as PlanState | null,
        garmin: (plan.garmin ?? {}) as Record<string, { mirroredAt: string; hash: string }>,
        inbox, snapshots, decisions,
      };
    },

    async hasWork() {
      const now = Date.now(), t = today();
      const [openR, ridesR, curR, stateR, healthR] = await Promise.all([
        // Exactly the partial index's predicate (0037 viking_docs_garmin_in_open).
        db.from(TABLE).select('lastFailedAt:data->>lastFailedAt').eq('user_id', userId).eq('coll', 'garmin_in').is('data->>processedAt', null).limit(100),
        db.from(TABLE).select('doc_id', { count: 'exact', head: true }).eq('user_id', userId).eq('coll', 'rides')
          .gt('updated_at', new Date(now - RIDE_FRESH_MS).toISOString()),
        db.from(TABLE).select('hash:data->>hash').eq('user_id', userId).eq('coll', 'plan').eq('doc_id', 'current').maybeSingle(),
        db.from(TABLE).select('healthSeenAt:data->>healthSeenAt').eq('user_id', userId).eq('coll', 'plan').eq('doc_id', 'state').maybeSingle(),
        db.from('life_health').select('updated_at').eq('user_id', userId).eq('local_date', t).maybeSingle(),
      ]);
      for (const r of [openR, ridesR, curR, stateR, healthR]) fail('viking hasWork read failed', r.error);
      const ready = ((openR.data ?? []) as Row[]).some((r) => {
        const at = typeof r.lastFailedAt === 'string' ? Date.parse(r.lastFailedAt) : NaN;
        return Number.isNaN(at) || now - at >= RETRY_MS;
      });
      if (ready) return true;
      if ((ridesR.count ?? 0) > 0) return true;
      if (!curR.data || !curR.data.hash) return true;
      if (!stateR.data) return true;
      const seen = typeof stateR.data.healthSeenAt === 'string' ? Date.parse(stateR.data.healthSeenAt) : NaN;
      const upd = healthR.data?.updated_at ? Date.parse(String(healthR.data.updated_at)) : NaN;
      return !Number.isNaN(upd) && (Number.isNaN(seen) || upd > seen);
    },

    put: (coll, id, data) => putDoc(db, userId, coll, id, data),

    async merge(coll, id, patch) { await mergeDoc(db, userId, coll, id, patch); },

    claim: (key) => claimKey(db, userId, key),

    async release(key) {
      const { error } = await db.from('life_nudge_log').delete().eq('user_id', userId).eq('key', key);
      fail(`release ${key} failed`, error);
    },

    send: (text, kb) => sendMessage(chatId, text, kb),

    async context(t: string) {
      const last = addDays(t, 7);
      const [shR, hR, dpR] = await Promise.all([
        db.from('life_shifts').select('ends_at').eq('user_id', userId).eq('status', 'confirmed')
          .gte('ends_at', zonedTime(t, '00:00', tz).toISOString()).lte('ends_at', zonedTime(last, '08:00', tz).toISOString()),
        db.from('life_health').select('data,updated_at').eq('user_id', userId).eq('local_date', t).maybeSingle(),
        db.from('life_day_plan').select('local_date,train_window,wake_at').eq('user_id', userId).gte('local_date', t).lte('local_date', last),
      ]);
      fail('life_shifts read failed', shR.error);
      fail('life_health read failed', hR.error);
      fail('life_day_plan read failed', dpR.error);
      // Local dates on which a confirmed shift ends between 00:00 and 08:00 local.
      const afterNight = new Set<string>();
      for (const s of (shR.data ?? []) as Row[]) {
        const lp = localParts(new Date(String(s.ends_at)), tz);
        if (lp.hour < 8 || (lp.hour === 8 && lp.minute === 0)) afterNight.add(lp.date);
      }
      const windows: Record<string, string> = {}, wakeAt: Record<string, string> = {};
      for (const r of (dpR.data ?? []) as Row[]) {
        const d = String(r.local_date);
        if (r.train_window) windows[d] = String(r.train_window);
        if (r.wake_at) wakeAt[d] = new Date(String(r.wake_at)).toISOString();
      }
      return {
        afterNight, windows, wakeAt,
        health: healthOf(hR.data?.data as Row | undefined),
        // The raw timestamptz string (microseconds): it becomes plan/state.healthSeenAt, which the
        // routines compare in SQL against life_health.updated_at, so it must not be truncated to ms.
        healthUpdatedAt: hR.data?.updated_at ? String(hR.data.updated_at) : undefined,
      };
    },
  };
}

// ── Chat tools ──────────────────────────────────────────────────────────────

const OFF = { off: true, note: 'Garmin-first Viking training is switched off (prefs.vikingGarmin), so there is no Jarvis plan to report or fix.' };

async function switchedOn(db: Db, userId: string): Promise<boolean> {
  const { data, error } = await db.from('life_profile').select('prefs').eq('user_id', userId).maybeSingle();
  fail('life_profile read failed', error);
  return vikingOn(data?.prefs);
}

function dayLine(d: PlanDay): Row {
  return {
    date: d.date, kind: d.kind,
    ...(d.session ? { session: SESS[d.session].n } : {}),
    ...(d.ride ? { code: d.ride.code, ride: RIDES[d.ride.code].n, minutes: d.ride.minutes, ...(d.ride.from ? { swappedFrom: d.ride.from } : {}) } : {}),
    ...(d.reason ? { reason: d.reason } : {}),
  };
}

function targetsLine(d: PlanDay): Row[] {
  return Object.entries(d.targets ?? {}).map(([k, p]) => ({
    exercise: shortName(k), key: k, kg: p.kg,
    ...(p.assistKg != null ? { assistKg: p.assistKg } : {}),
    reps: p.reps, sets: p.sets,
    ...(p.note ? { note: p.note } : {}),
    ...(p.repsUnknown ? { repsNotYetRecorded: true } : {}),
  }));
}

/** Sets the watch didn't record (est), per exercise: what's still waiting for a correction. */
function assumed(doc: WorkoutDoc): Row[] {
  const out: Row[] = [];
  for (const e of doc.entries ?? []) {
    const idx = (e.sets ?? []).map((st, i) => (st.est?.length ? i + 1 : 0)).filter((i) => i > 0);
    if (!idx.length) continue;
    const fields = [...new Set((e.sets ?? []).flatMap((st) => st.est ?? []))];
    out.push({ exercise: EXBY[e.ex] ? shortName(e.ex) : e.ex, key: e.ex, sets: idx, assumed: fields, values: e.sets.map((st) => `${st.kg} kg × ${st.reps}`) });
  }
  return out;
}

/** viking_status: a summary for the chat, never the plan DTOs. */
export async function vikingStatus(db: Db, userId: string, today: string): Promise<unknown> {
  if (!(await switchedOn(db, userId))) return OFF;
  const [cur, state, lastR, decR] = await Promise.all([
    getDoc<PlanCurrent>(db, userId, 'plan', 'current'),
    getDoc<PlanState>(db, userId, 'plan', 'state'),
    db.from(TABLE).select('doc_id,data').eq('user_id', userId).eq('coll', 'workouts').lt('doc_id', addDays(today, 1)).order('doc_id', { ascending: false }).limit(5),
    db.from(TABLE).select('doc_id').eq('user_id', userId).eq('coll', 'plan').like('doc_id', 'decision-%')
      .gt('updated_at', new Date(Date.now() - DECISION_DAYS * 86_400_000).toISOString()),
  ]);
  fail('workouts read failed', lastR.error);
  fail('plan decisions read failed', decR.error);
  const days = Array.isArray(cur?.days) ? cur.days : [];
  const todayDay = days.find((d) => d.date === today);
  const docs = ((lastR.data ?? []) as Row[]).map((r) => ({ id: String(r.doc_id), doc: r.data as WorkoutDoc })).filter((x) => x.doc && SESS[x.doc.session]);
  const logged = (d: PlanDay) => docs.some((x) => x.doc.date === d.date && x.doc.session === d.session);
  const gym = days.find((d) => d.kind === 'gym' && d.session && !logged(d));
  const key = (x: { doc: WorkoutDoc }) => `${x.doc.date} ${x.doc.startedAt ?? ''}`;
  const last = [...docs].sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0))[0];
  const decided = new Set(((decR.data ?? []) as Row[]).map((r) => String(r.doc_id).slice('decision-'.length)));
  const pending = (state?.suggestions ?? []).filter((x) => x.status === 'pending' && !decided.has(x.id));
  return {
    today: {
      date: today,
      plan: todayDay ? dayLine(todayDay) : null,
      logged: docs.filter((x) => x.doc.date === today).map((x) => SESS[x.doc.session].n),
    },
    nextGymDay: gym ? { date: gym.date, session: SESS[gym.session!].n, targets: targetsLine(gym) } : null,
    next7Days: days.slice(0, 7).map(dayLine),
    lastSession: last ? {
      date: last.doc.date, session: SESS[last.doc.session].n, logged: last.doc.source === 'garmin' ? 'from the watch' : 'typed in',
      waitingForCorrection: assumed(last.doc),
    } : null,
    pendingSuggestions: pending.map((x) => ({ exercise: shortName(x.ex), resetToKg: x.kg, askedAt: x.createdAt })),
    ...(cur ? { planBuiltAt: cur.builtAt, ...(cur.hash ? {} : { note: 'The plan is being rebuilt at the next tick (within a minute).' }) }
      : { note: 'No plan built yet; the next tick builds one.' }),
  };
}

const num = (v: unknown, what: string): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${what} must be a number`);
  return n;
};

let fixChain: Promise<unknown> = Promise.resolve();

/** viking_fix: patch (or, for a session Jarvis couldn't read, create) workouts/<date>_<session>.
 *  Claude may call it several times in parallel in one turn; the calls run one
 *  after another so each read-modify-write sees the previous one's doc. */
export function vikingFix(db: Db, userId: string, tz: string, today: string, input: Row): Promise<unknown> {
  const run = fixChain.then(() => fixOnce(db, userId, tz, today, input));
  fixChain = run.catch(() => undefined);
  return run;
}

async function fixOnce(db: Db, userId: string, tz: string, today: string, input: Row): Promise<unknown> {
  if (!(await switchedOn(db, userId))) return OFF;
  const date = String(input.date ?? '').trim();
  if (!DATE_RE.test(date)) throw new Error('date must be YYYY-MM-DD');
  const sk = String(input.session ?? '').trim().toUpperCase() as SessionKey;
  if (!ORDER.includes(sk)) throw new Error('session must be UA, LA, UB or LB (Upper A, Lower A, Upper B, Lower B)');
  const exs = SESS[sk].ex;
  const q = String(input.exercise ?? '').trim().toLowerCase();
  const ex = exs.find((e) => e.k.toLowerCase() === q || shortName(e.k).toLowerCase() === q || e.n.toLowerCase() === q);
  if (!ex) throw new Error(`Unknown exercise "${String(input.exercise ?? '')}" for ${SESS[sk].n}. Use one of: ${exs.map((e) => `${shortName(e.k)} (${e.k})`).join(', ')}`);
  const kg = num(input.kg, 'kg'), reps = num(input.reps, 'reps'), set = num(input.set, 'set');
  if (kg === undefined && reps === undefined) throw new Error('Give kg, reps or both');
  if (reps !== undefined && (reps < 0 || !Number.isInteger(reps))) throw new Error('reps must be a whole number, 0 or more');
  if (kg !== undefined && kg < 0 && ex.inc !== 'pull') throw new Error('kg can only be negative for pull-up assist');
  if (set !== undefined && (set < 1 || !Number.isInteger(set))) throw new Error('set is 1-based: 1, 2, 3…');

  const docId = `${date}_${sk}`;
  let doc = await getDoc<WorkoutDoc>(db, userId, 'workouts', docId);
  let D: VikingData | null = null;
  const data = async () => (D ??= await loadData(db, userId));
  const created = !doc;
  if (!doc) {
    if (date > today) throw new Error(`${date} is in the future; log it once it's done`);
    const { data: open, error } = await db.from(TABLE).select('doc_id,date:data->>date').eq('user_id', userId).eq('coll', 'garmin_in').is('data->>processedAt', null);
    fail('garmin_in read failed', error);
    if (((open ?? []) as Row[]).some((r) => r.date === date))
      throw new Error(`A watch session from ${date} is still waiting to import; its recap follows within a few minutes. Correct it after that instead of creating one.`);
    const DD = await data();
    if (!DD.settings) throw new Error('Project Viking has no settings yet');
    const v = viking(DD), wk = v.weekOf(date);
    // No `source`: the owner's version wins over any later import.
    doc = { date, session: sk, week: wk, phase: v.phaseOf(date), deload: v.isDeloadWeek(wk), entries: [], savedAt: Date.now(), startedAt: zonedTime(date, '12:00', tz).toISOString() };
  }

  const fields: Array<'kg' | 'reps'> = [...(kg !== undefined ? ['kg' as const] : []), ...(reps !== undefined ? ['reps' as const] : [])];
  const sets: SetEntry[] = [...((doc.entries ?? []).find((e) => e.ex === ex.k)?.sets ?? [])];
  const patch = (st: SetEntry): SetEntry => {
    const est = (st.est ?? []).filter((f) => !fields.includes(f));
    const { est: _drop, ...rest } = st;
    return { ...rest, ...(kg !== undefined ? { kg } : {}), ...(reps !== undefined ? { reps } : {}), ...(est.length ? { est } : {}) };
  };
  /** A new set: the last set's values (else kg 0, the low end of the rep
   *  range), all marked assumed; patch() then clears what was given. */
  const fresh = (): SetEntry => {
    const prev = sets[sets.length - 1];
    const est: Array<'kg' | 'reps'> = ex.inc === 'bw' ? ['reps'] : ['kg', 'reps'];
    return { kg: ex.inc === 'bw' ? 0 : prev?.kg ?? 0, reps: prev?.reps ?? ex.r[0], est };
  };
  if (set === undefined) {
    if (!sets.length) {
      const n = viking(await data()).setCount(ex, sk, doc.phase, doc.deload);
      for (let i = 0; i < n; i++) sets.push(fresh());
    }
    for (let i = 0; i < sets.length; i++) sets[i] = patch(sets[i]);
  } else if (set <= sets.length) sets[set - 1] = patch(sets[set - 1]);
  else if (set === sets.length + 1) sets.push(patch(fresh()));
  else throw new Error(`${shortName(ex.k)} has ${sets.length} set(s) on ${date}: set must be 1–${sets.length + 1}`);

  const others = (doc.entries ?? []).filter((e) => e.ex !== ex.k);
  const rank = (k: string) => { const i = exs.findIndex((e) => e.k === k); return i < 0 ? exs.length : i; };
  const entries = [...others, { ex: ex.k, sets }].sort((a, b) => rank(a.ex) - rank(b.ex));
  const next: WorkoutDoc = { ...doc, entries, savedAt: Date.now() };

  let tick: string | undefined;
  if (created) {
    if (!(await createDoc(db, userId, 'workouts', docId, next))) throw new Error(`${docId} was just saved by the import; ask again to correct it`);
    const DD = await data();
    DD.workouts[docId] = next;
    const t = gymTick(DD, date, sk, Date.now());
    if (t) {
      await putDoc(db, userId, 'cycle', t.id, t.doc);
      tick = `cycle day ${t.doc.day} ticked${t.realigned ? ' (the cycle realigned to this session)' : ''}`;
    }
  } else {
    await putDoc(db, userId, 'workouts', docId, next);
  }
  try { await clearPlanHash(db, userId); } catch (err) { console.error('life-bot: plan/current hash not cleared', err); }
  return {
    ok: true, created, doc: docId, session: SESS[sk].n, exercise: shortName(ex.k),
    sets: sets.map((st, i) => ({ set: i + 1, kg: st.kg, reps: st.reps, ...(st.est?.length ? { stillAssumed: st.est } : {}) })),
    ...(tick ? { tick } : {}),
    note: 'The plan and the watch pick this up at the next tick.',
  };
}
