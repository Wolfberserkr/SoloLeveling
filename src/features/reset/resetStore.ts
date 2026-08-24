import { create } from 'zustand';
import { dayById, exerciseById, type Exercise } from './resetData';
import {
  defaultState, loadCache, saveCache, flushQueue, fetchAll,
  upsertAppState, insertSession, insertExerciseLog, upsertWeight, upsertNutrition,
  updateSessionRow,
  type ResetState, type Session, type SessionExercise,
} from './resetDb';

type ResetStore = {
  ready: boolean;
  uid: string | null;
  s: ResetState;
  init: (uid: string) => Promise<void>;
  bumpWeek: (n: number) => void;
  toggleSet: (dayId: string, slotId: string, i: number) => void;
  logVal: (dayId: string, slotId: string, k: 'reps' | 'weight', v: string) => void;
  finishSession: (dayId: string) => { done: number; total: number; dayName: string; exercisesCompleted: number };
  updateSession: (dateKey: string, exercises: SessionExercise[]) => void;
  addSession: (dayId: string, dateISO: string, exercises: SessionExercise[]) => string | null;
  toggleSection: (key: 'prs' | 'hist') => void;
  resetDay: (dayId: string) => void;
  confirmSwap: (dayId: string, slotId: string, altId: string) => void;
  restoreSwap: (dayId: string, slotId: string) => void;
  saveVideo: (exId: string, url: string) => void;
  saveNutrition: (rating: string, note: string) => void;
  logWeight: (kg: number) => void;
  setCalMonth: (m: string) => void;
};

/** Ensure per-set boolean arrays exist for every slot of a day, sized from the
 *  exercise she will actually perform — the swapped-in alternative when there
 *  is one. Sizing from the plan while counting the resolved exercise is how a
 *  4-box / 3-set session ends up reporting more sets done than it prescribed,
 *  so there is exactly one source of truth: resolvedExercise().sets. */
function ensureDay(s: ResetState, dayId: string): ResetState['progress'] {
  const d = dayById(dayId);
  if (!d) return s.progress;
  const next = { ...s.progress, [dayId]: { ...(s.progress[dayId] || {}) } };
  d.ex.forEach((slot) => {
    const e = resolvedExercise(s, dayId, slot.id);
    const a = next[dayId][slot.id];
    if (!Array.isArray(a) || a.length !== e.sets) next[dayId][slot.id] = new Array(e.sets).fill(false);
  });
  return next;
}

/** Blank per-set arrays for a day, sized like ensureDay. */
function clearedDay(s: ResetState, dayId: string): Record<string, boolean[]> {
  const out: Record<string, boolean[]> = {};
  (dayById(dayId)?.ex ?? []).forEach((slot) => {
    out[slot.id] = new Array(resolvedExercise(s, dayId, slot.id).sets).fill(false);
  });
  return out;
}

export const useResetStore = create<ResetStore>((set, get) => ({
  ready: false,
  uid: null,
  s: defaultState(),

  init: async (uid) => {
    const cached = loadCache(uid);
    set({ uid, s: cached, ready: true });
    // Background reconcile with the cloud, then merge.
    await flushQueue(uid);
    const cloud = await fetchAll(uid);
    if (!cloud) return;
    const cur = get().s;
    const next: ResetState = { ...cur };
    if (cloud.appState) {
      next.week = cloud.appState.week ?? cur.week;
      next.progress = cloud.appState.progress ?? cur.progress;
      next.swaps = cloud.appState.swaps ?? cur.swaps;
      next.videos = cloud.appState.videos ?? cur.videos;
    }
    if (cloud.sessions.length) {
      next.sessions = cloud.sessions;
      next.history = [...cloud.sessions].sort((a, b) => +new Date(a.date) - +new Date(b.date));
    }
    if (cloud.logs.length) next.cloudLogs = cloud.logs;
    if (cloud.weights.length) next.weights = cloud.weights;
    if (cloud.nutrition.length) {
      next.nutrition = cloud.nutrition.map((n) => ({ date: n.date, rating: n.rating, note: n.note }));
    }
    saveCache(uid, next);
    set({ s: next });
  },

  bumpWeek: (n) => {
    const { uid, s } = get();
    if (!uid) return;
    const week = Math.min(12, Math.max(1, s.week + n));
    const next = { ...s, week };
    saveCache(uid, next);
    void upsertAppState(uid, next);
    set({ s: next });
  },

  toggleSet: (dayId, slotId, i) => {
    const { uid, s } = get();
    if (!uid) return;
    const progress = ensureDay(s, dayId);
    const arr = [...progress[dayId][slotId]];
    arr[i] = !arr[i];
    progress[dayId] = { ...progress[dayId], [slotId]: arr };
    const next = { ...s, progress };
    saveCache(uid, next);
    void upsertAppState(uid, next);
    set({ s: next });
  },

  logVal: (dayId, slotId, k, v) => {
    const { uid, s } = get();
    if (!uid) return;
    const cur = s.log[slotId] || { reps: '', weight: '' };
    const entry = { ...cur, [k]: v };
    const log = { ...s.log, [slotId]: entry };
    const next = { ...s, log };
    saveCache(uid, next);
    set({ s: next });
    // Persist a log row once both reps and a parseable weight are present.
    // The row is credited to the exercise she actually did — after a swap
    // (an occupied machine) that is the alternative, not the plan slot.
    // Matches updateSession, which already logs the resolved id.
    const w = parseFloat(entry.weight);
    const exId = resolvedExercise(s, dayId, slotId).id;
    if (entry.reps && !isNaN(w)) void insertExerciseLog(uid, { exercise_id: exId, reps: entry.reps, weight: w });
  },

  finishSession: (dayId) => {
    const { uid, s } = get();
    const d = dayById(dayId)!;
    const { exercises, done, total, progress } = sessionTally(s, dayId);
    const date = new Date().toISOString();
    const entry: Session = { dayId, name: d.name, date, done, total, exercises };
    // Reset that day's set progress.
    const nextProgress = { ...progress, [dayId]: clearedDay(s, dayId) };
    const next: ResetState = {
      ...s,
      progress: nextProgress,
      history: [...s.history, entry],
      sessions: [entry, ...s.sessions],
    };
    if (uid) {
      saveCache(uid, next);
      void upsertAppState(uid, next);
      void insertSession(uid, {
        day_id: dayId, day_name: d.name, completed_at: date,
        done_sets: done, total_sets: total, exercises,
      });
    }
    set({ s: next });
    return { done, total, dayName: d.name, exercisesCompleted: exercises.filter((e) => e.sets_done === e.sets_total).length };
  },

  updateSession: (dateKey, exercises) => {
    const { uid, s } = get();
    if (!uid) return;
    const orig = s.history.find((x) => x.date === dateKey);
    if (!orig) return;
    const updated = applySessionEdit(orig, exercises);
    const next: ResetState = {
      ...s,
      history: s.history.map((x) => (x.date === dateKey ? updated : x)),
      sessions: s.sessions.map((x) => (x.date === dateKey ? updated : x)),
    };
    saveCache(uid, next);
    void updateSessionRow(uid, updated);
    // Keep PRs in sync: a newly filled-in (or corrected) reps + weight gets a
    // log row, same as logging it live would have.
    exercises.forEach((e) => {
      const before = orig.exercises.find((o) => o.slot_id === e.slot_id);
      const changed = !before || before.reps !== e.reps || before.weight !== e.weight;
      const w = parseFloat(e.weight);
      if (changed && e.reps && !isNaN(w)) void insertExerciseLog(uid, { exercise_id: e.id, reps: e.reps, weight: w });
    });
    set({ s: next });
  },

  addSession: (dayId, dateISO, exercises) => {
    const { uid, s } = get();
    if (!uid) return null;
    const entry = buildRetroSession(dayId, dateISO, exercises);
    if (!entry) return null;
    const next: ResetState = {
      ...s,
      history: [...s.history, entry].sort((a, b) => +new Date(a.date) - +new Date(b.date)),
      sessions: [entry, ...s.sessions].sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    };
    saveCache(uid, next);
    void insertSession(uid, {
      day_id: entry.dayId, day_name: entry.name, completed_at: entry.date,
      done_sets: entry.done, total_sets: entry.total, exercises,
    });
    exercises.forEach((e) => {
      const w = parseFloat(e.weight);
      if (e.reps && !isNaN(w)) void insertExerciseLog(uid, { exercise_id: e.id, reps: e.reps, weight: w });
    });
    set({ s: next });
    return entry.date;
  },

  toggleSection: (key) => {
    const { uid, s } = get();
    const collapsed = { ...(s.collapsed || {}), [key]: !s.collapsed?.[key] };
    const next = { ...s, collapsed };
    if (uid) saveCache(uid, next);
    set({ s: next });
  },

  resetDay: (dayId) => {
    const { uid, s } = get();
    if (!uid) return;
    const progress = ensureDay(s, dayId);
    const next = { ...s, progress: { ...progress, [dayId]: clearedDay(s, dayId) } };
    saveCache(uid, next);
    void upsertAppState(uid, next);
    set({ s: next });
  },

  confirmSwap: (dayId, slotId, altId) => {
    const { uid, s } = get();
    if (!uid) return;
    const swaps = { ...s.swaps, [dayId]: { ...(s.swaps[dayId] || {}), [slotId]: altId } };
    const next = { ...s, swaps };
    saveCache(uid, next);
    void upsertAppState(uid, next);
    set({ s: next });
  },

  restoreSwap: (dayId, slotId) => {
    const { uid, s } = get();
    if (!uid || !s.swaps[dayId]?.[slotId]) return;
    const dayMap = { ...s.swaps[dayId] };
    delete dayMap[slotId];
    const next = { ...s, swaps: { ...s.swaps, [dayId]: dayMap } };
    saveCache(uid, next);
    void upsertAppState(uid, next);
    set({ s: next });
  },

  saveVideo: (exId, url) => {
    const { uid, s } = get();
    if (!uid) return;
    const next = { ...s, videos: { ...s.videos, [exId]: url } };
    saveCache(uid, next);
    void upsertAppState(uid, next);
    set({ s: next });
  },

  saveNutrition: (rating, note) => {
    const { uid, s } = get();
    if (!uid) return;
    const date = new Date().toISOString().slice(0, 10);
    const nutrition = [...s.nutrition.filter((n) => n.date !== date), { date, rating, note }];
    const next = { ...s, nutrition };
    saveCache(uid, next);
    void upsertNutrition(uid, { recorded_on: date, rating, note });
    set({ s: next });
  },

  logWeight: (kg) => {
    const { uid, s } = get();
    if (!uid) return;
    const date = new Date().toISOString().slice(0, 10);
    const weights = [...s.weights.filter((w) => w.date !== date), { date, kg }].sort((a, b) => a.date.localeCompare(b.date));
    const next = { ...s, weights };
    saveCache(uid, next);
    void upsertWeight(uid, kg, date);
    set({ s: next });
  },

  setCalMonth: (m) => set((st) => ({ s: { ...st.s, calMonth: m } })),
}));

/** Merge an edited exercise list into a finished session. Counts are recomputed
 *  from the list; for a legacy session with no per-exercise snapshot the stored
 *  totals are the only record of the workout, so they can only grow — an edit
 *  never erases sets that were already banked. Date, day, and id are kept. */
export function applySessionEdit(orig: Session, exercises: SessionExercise[]): Session {
  const sumDone = exercises.reduce((a, e) => a + e.sets_done, 0);
  const sumTotal = exercises.reduce((a, e) => a + e.sets_total, 0);
  const hadSnapshot = orig.exercises.length > 0;
  return {
    ...orig,
    exercises,
    done: hadSnapshot ? sumDone : Math.max(orig.done, sumDone),
    total: hadSnapshot ? sumTotal : Math.max(orig.total, sumTotal),
  };
}

/** Build a session logged in retrospect for a blank calendar day — a workout
 *  that happened but never got saved. Anchored to local noon of the picked day
 *  so the entry can't drift into a neighbouring date in any timezone. */
export function buildRetroSession(dayId: string, dateISO: string, exercises: SessionExercise[]): Session | null {
  const d = dayById(dayId);
  if (!d) return null;
  return {
    dayId,
    name: d.name,
    date: new Date(`${dateISO}T12:00:00`).toISOString(),
    done: exercises.reduce((a, e) => a + e.sets_done, 0),
    total: exercises.reduce((a, e) => a + e.sets_total, 0),
    exercises,
  };
}

// ── Pure selectors (take the state slice) ────────────────────────────────────
export function resolvedExercise(s: ResetState, dayId: string, exId: string): Exercise {
  const altId = s.swaps?.[dayId]?.[exId];
  if (altId) {
    const alt = exerciseById(altId);
    // A swap saved against the old home program can point at a movement this
    // program retired. exerciseById resolves those to a name-only stub so old
    // logs still read — but a stub has no sets and no prescription, so it must
    // never become the exercise of the day. Fall back to the plan slot.
    if (alt && !alt.retired) return alt;
  }
  return exerciseById(exId)!;
}

/** Everything a finished session records, computed from state alone: the
 *  per-exercise snapshot plus the set tallies. Pure, so the arithmetic that
 *  reaches the cloud is testable without touching the network. Sets done are
 *  clamped to sets prescribed, so `done <= total` always holds. */
export function sessionTally(s: ResetState, dayId: string): {
  exercises: SessionExercise[]; done: number; total: number; progress: ResetState['progress'];
} {
  const d = dayById(dayId);
  if (!d) return { exercises: [], done: 0, total: 0, progress: s.progress };
  const progress = ensureDay(s, dayId);
  let done = 0;
  let total = 0;
  const exercises = d.ex.map((slot) => {
    const e = resolvedExercise(s, dayId, slot.id);
    const arr = progress[dayId][slot.id] ?? [];
    const setsDone = Math.min(arr.filter(Boolean).length, e.sets);
    const lg = s.log[slot.id] || { reps: '', weight: '' };
    done += setsDone;
    total += e.sets;
    return {
      id: e.id, slot_id: slot.id, name: e.name, focus: d.focus,
      sets_total: e.sets, sets_done: setsDone, reps: lg.reps, weight: lg.weight,
      prescribe: e.reps,
    };
  });
  return { exercises, done, total, progress };
}

export function dayCount(s: ResetState, dayId: string): { done: number; total: number; pct: number } {
  const d = dayById(dayId);
  if (!d) return { done: 0, total: 0, pct: 0 };
  let done = 0;
  let total = 0;
  d.ex.forEach((slot) => {
    const e = resolvedExercise(s, dayId, slot.id);
    const a = s.progress[dayId]?.[slot.id] || new Array(e.sets).fill(false);
    total += e.sets;
    done += Math.min(a.filter(Boolean).length, e.sets);
  });
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

export function lastDone(s: ResetState, dayId: string): string | null {
  const h = s.history.filter((x) => x.dayId === dayId);
  if (!h.length) return null;
  return relDate(h[h.length - 1].date);
}

export function relDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - +d) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return days + 'd ago';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function effectiveVideo(s: ResetState, e: Exercise): string {
  return (s.videos[e.id] || e.video || '').trim();
}

export type PR = { weight: number; reps: string; date: string | null };
export function derivedPRs(s: ResetState): Record<string, PR> {
  const prs: Record<string, PR> = {};
  Object.entries(s.log || {}).forEach(([exId, l]) => {
    const w = parseFloat(l.weight);
    if (!isNaN(w) && l.reps) prs[exId] = { weight: w, reps: l.reps, date: null };
  });
  (s.cloudLogs || []).forEach((r) => {
    const w = Number(r.weight);
    if (!w) return;
    const cur = prs[r.exercise_id];
    if (!cur || w > cur.weight) prs[r.exercise_id] = { weight: w, reps: r.reps, date: r.logged_at };
  });
  return prs;
}
