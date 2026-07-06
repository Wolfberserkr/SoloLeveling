// Supabase data layer for the Reset portal — the swap-in for DWorkout's db.js.
// Cache-first (instant UI from localStorage), writes go straight to Supabase
// under the logged-in user (RLS scopes rows to auth.uid()); failed writes are
// queued in localStorage and retried on next load / when back online.
import { supabase } from '@/lib/supabase';

export type SetProgress = Record<string, Record<string, boolean[]>>;
export type Swaps = Record<string, Record<string, string>>;
export type Videos = Record<string, string>;
export type LogDraft = Record<string, { reps: string; weight: string }>;

export type SessionExercise = {
  id: string;
  slot_id: string;
  name: string;
  focus: string;
  sets_total: number;
  sets_done: number;
  reps: string;
  weight: string;
};
export type Session = {
  id?: string;
  dayId: string;
  name: string;
  date: string; // completed_at ISO
  done: number;
  total: number;
  exercises: SessionExercise[];
};
export type Weight = { date: string; kg: number };
export type Nutrition = { date: string; rating: string; note: string };
export type CloudLog = { exercise_id: string; reps: string; weight: number; logged_at: string };

export type ResetState = {
  week: number;
  progress: SetProgress;
  log: LogDraft;
  videos: Videos;
  swaps: Swaps;
  history: Session[]; // ascending by date
  sessions: Session[]; // newest first
  weights: Weight[];
  nutrition: Nutrition[];
  cloudLogs: CloudLog[];
  calMonth?: string;
  /** Epoch ms of the last local app-state write, so the cloud reconcile on
   *  reopen never overwrites newer local checkmarks with a stale cloud row. */
  updatedAt?: number;
  /** ISO date (Sunday) of the training week the current checkmarks belong to.
   *  When a new week begins, the day checkmarks auto-clear for a fresh start
   *  (past sessions stay in history for review). */
  progressWeekStart?: string;
};

export function defaultState(): ResetState {
  return {
    week: 1, progress: {}, log: {}, videos: {}, swaps: {},
    history: [], sessions: [], weights: [], nutrition: [], cloudLogs: [],
    updatedAt: 0,
  };
}

// ── Per-user local cache ─────────────────────────────────────────────────────
const cacheKey = (uid: string) => `reset_state_v1_${uid}`;
const queueKey = (uid: string) => `reset_queue_v1_${uid}`;

export function loadCache(uid: string): ResetState {
  try {
    const raw = localStorage.getItem(cacheKey(uid));
    if (raw) return { ...defaultState(), ...(JSON.parse(raw) as ResetState) };
  } catch {
    /* ignore */
  }
  return defaultState();
}
export function saveCache(uid: string, state: ResetState) {
  try {
    // Don't persist derived cloudLogs — they're refetched.
    const { cloudLogs: _omit, ...persist } = state;
    localStorage.setItem(cacheKey(uid), JSON.stringify(persist));
  } catch {
    /* storage full/unavailable — in-memory state still works this session */
  }
}

// ── Offline write queue ──────────────────────────────────────────────────────
type Op =
  | { kind: 'upsert'; table: string; data: Record<string, unknown>; onConflict: string }
  | { kind: 'insert'; table: string; data: Record<string, unknown> };

function loadQueue(uid: string): Op[] {
  try {
    return (JSON.parse(localStorage.getItem(queueKey(uid)) || '[]') as Op[]) ?? [];
  } catch {
    return [];
  }
}
function saveQueue(uid: string, q: Op[]) {
  try {
    localStorage.setItem(queueKey(uid), JSON.stringify(q));
  } catch {
    /* ignore */
  }
}

async function runOp(op: Op): Promise<void> {
  if (op.kind === 'upsert') {
    const { error } = await supabase.from(op.table).upsert(op.data, { onConflict: op.onConflict });
    if (error) throw error;
  } else {
    const { error } = await supabase.from(op.table).insert(op.data);
    if (error) throw error;
  }
}

async function pushOp(uid: string, op: Op): Promise<void> {
  try {
    await runOp(op);
  } catch {
    const q = loadQueue(uid);
    q.push(op);
    saveQueue(uid, q);
  }
}

export async function flushQueue(uid: string): Promise<void> {
  const q = loadQueue(uid);
  if (!q.length) return;
  const remaining: Op[] = [];
  for (const op of q) {
    try {
      await runOp(op);
    } catch {
      remaining.push(op);
    }
  }
  saveQueue(uid, remaining);
}

// ── Writes ───────────────────────────────────────────────────────────────────
export function upsertAppState(
  uid: string,
  s: Pick<ResetState, 'week' | 'progress' | 'swaps' | 'videos'>,
) {
  return pushOp(uid, {
    kind: 'upsert',
    table: 'reset_app_state',
    onConflict: 'user_id',
    data: {
      user_id: uid,
      week: s.week,
      progress: s.progress,
      swaps: s.swaps,
      videos: s.videos,
      updated_at: new Date().toISOString(),
    },
  });
}

/** Insert a finished session; returns its id (best-effort — null if queued). */
export async function insertSession(uid: string, session: {
  day_id: string; day_name: string; completed_at: string;
  done_sets: number; total_sets: number; exercises: SessionExercise[];
}): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('reset_sessions')
      .insert({ ...session, user_id: uid })
      .select('id')
      .single();
    if (error) throw error;
    return (data?.id as string) ?? null;
  } catch {
    const q = loadQueue(uid);
    q.push({ kind: 'insert', table: 'reset_sessions', data: { ...session, user_id: uid } });
    saveQueue(uid, q);
    return null;
  }
}

export function insertExerciseLog(
  uid: string,
  row: { exercise_id: string; reps: string; weight: number | null },
) {
  return pushOp(uid, {
    kind: 'insert',
    table: 'reset_exercise_logs',
    // weight is nullable — bodyweight / timed moves (plank, dead bug) log
    // reps (or a held duration) with no load.
    data: {
      exercise_id: row.exercise_id,
      reps: row.reps || null,
      weight: row.weight,
      user_id: uid,
      logged_at: new Date().toISOString(),
    },
  });
}

export function upsertWeight(uid: string, kg: number, recorded_on: string) {
  return pushOp(uid, {
    kind: 'upsert',
    table: 'reset_weights',
    onConflict: 'user_id,recorded_on',
    data: { user_id: uid, kg, recorded_on, updated_at: new Date().toISOString() },
  });
}

export function upsertNutrition(uid: string, n: { recorded_on: string; rating: string; note: string }) {
  return pushOp(uid, {
    kind: 'upsert',
    table: 'reset_nutrition',
    onConflict: 'user_id,recorded_on',
    data: {
      user_id: uid,
      recorded_on: n.recorded_on,
      rating: n.rating,
      note: n.note || null,
      updated_at: new Date().toISOString(),
    },
  });
}

// ── Cloud read (reconcile on boot) ───────────────────────────────────────────
export type CloudSnapshot = {
  appState: { week: number; progress: SetProgress; swaps: Swaps; videos: Videos; updatedAt: number } | null;
  sessions: Session[];
  logs: CloudLog[];
  weights: Weight[];
  nutrition: Nutrition[];
};

export async function fetchAll(uid: string): Promise<CloudSnapshot | null> {
  try {
    const [stRes, sessRes, logRes, wtRes, nutRes] = await Promise.all([
      supabase.from('reset_app_state').select('*').eq('user_id', uid).maybeSingle(),
      supabase.from('reset_sessions').select('*').eq('user_id', uid).order('completed_at', { ascending: false }).limit(200),
      supabase.from('reset_exercise_logs').select('exercise_id, reps, weight, logged_at').eq('user_id', uid).order('logged_at', { ascending: false }).limit(500),
      supabase.from('reset_weights').select('recorded_on, kg').eq('user_id', uid).order('recorded_on', { ascending: true }),
      supabase.from('reset_nutrition').select('recorded_on, rating, note').eq('user_id', uid).order('recorded_on', { ascending: false }).limit(60),
    ]);
    const st = stRes.data as
      | { week: number; progress: SetProgress; swaps: Swaps; videos: Videos; updated_at?: string }
      | null;
    return {
      appState: st
        ? {
            week: st.week,
            progress: st.progress || {},
            swaps: st.swaps || {},
            videos: st.videos || {},
            updatedAt: st.updated_at ? +new Date(st.updated_at) : 0,
          }
        : null,
      sessions: ((sessRes.data ?? []) as Array<Record<string, unknown>>).map((s) => ({
        id: s.id as string,
        dayId: s.day_id as string,
        name: s.day_name as string,
        date: s.completed_at as string,
        done: Number(s.done_sets),
        total: Number(s.total_sets),
        exercises: (s.exercises as SessionExercise[]) || [],
      })),
      logs: ((logRes.data ?? []) as Array<Record<string, unknown>>).map((l) => ({
        exercise_id: l.exercise_id as string,
        reps: String(l.reps ?? ''),
        weight: Number(l.weight),
        logged_at: l.logged_at as string,
      })),
      weights: ((wtRes.data ?? []) as Array<Record<string, unknown>>).map((w) => ({
        date: w.recorded_on as string,
        kg: Number(w.kg),
      })),
      nutrition: ((nutRes.data ?? []) as Array<Record<string, unknown>>).map((n) => ({
        date: n.recorded_on as string,
        rating: n.rating as string,
        note: (n.note as string) || '',
      })),
    };
  } catch {
    return null;
  }
}
