import { create } from 'zustand';
import { dayById, exerciseById, type Exercise } from './resetData';
import {
  defaultState, loadCache, saveCache, flushQueue, fetchAll,
  upsertAppState, insertSession, insertExerciseLog, upsertWeight, upsertNutrition,
  type ResetState, type Session,
} from './resetDb';

type ResetStore = {
  ready: boolean;
  uid: string | null;
  s: ResetState;
  init: (uid: string) => Promise<void>;
  bumpWeek: (n: number) => void;
  toggleSet: (dayId: string, slotId: string, i: number) => void;
  logVal: (slotId: string, k: 'reps' | 'weight', v: string) => void;
  finishSession: (dayId: string) => { done: number; total: number; dayName: string; exercisesCompleted: number };
  resetDay: (dayId: string) => void;
  confirmSwap: (dayId: string, slotId: string, altId: string) => void;
  restoreSwap: (dayId: string, slotId: string) => void;
  saveVideo: (exId: string, url: string) => void;
  saveNutrition: (rating: string, note: string) => void;
  logWeight: (kg: number) => void;
  setCalMonth: (m: string) => void;
};

/** ISO date (YYYY-MM-DD) of the Sunday that starts the week containing `d`.
 *  The training week rolls over on Sunday — checkmarks reset then. */
export function weekStartSunday(d = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay()); // getDay(): Sun=0 → back to Sunday
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Ensure per-set boolean arrays exist for every exercise of a day. */
function ensureDay(progress: ResetState['progress'], dayId: string): ResetState['progress'] {
  const d = dayById(dayId);
  if (!d) return progress;
  const next = { ...progress, [dayId]: { ...(progress[dayId] || {}) } };
  d.ex.forEach((e) => {
    const a = next[dayId][e.id];
    if (!Array.isArray(a) || a.length !== e.sets) next[dayId][e.id] = new Array(e.sets).fill(false);
  });
  return next;
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
    // Only let the cloud app-state win when it is at least as new as our local
    // cache. Otherwise a stale cloud row (e.g. a write that failed and is still
    // queued) would wipe checkmarks the user just made — the "everything reset
    // when I came back" bug. Queued writes flush above, so a genuinely newer
    // cloud is honoured; a stale one is left for flushQueue to catch up to.
    if (cloud.appState && cloud.appState.updatedAt >= (cur.updatedAt ?? 0)) {
      next.week = cloud.appState.week ?? cur.week;
      next.progress = cloud.appState.progress ?? cur.progress;
      next.swaps = cloud.appState.swaps ?? cur.swaps;
      next.videos = cloud.appState.videos ?? cur.videos;
      next.updatedAt = cloud.appState.updatedAt;
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

    // Weekly reset: when the training week rolls over (Sunday), clear the day
    // checkmarks for a fresh start. Every finished session is preserved in
    // history, so nothing is lost — this only clears the live plan boxes.
    const thisWeek = weekStartSunday();
    const newWeek = !!next.progressWeekStart && next.progressWeekStart !== thisWeek;
    if (newWeek) {
      next.progress = {};
      next.updatedAt = Date.now();
    }
    next.progressWeekStart = thisWeek;

    saveCache(uid, next);
    if (newWeek) void upsertAppState(uid, next);
    set({ s: next });
  },

  bumpWeek: (n) => {
    const { uid, s } = get();
    if (!uid) return;
    const week = Math.min(12, Math.max(1, s.week + n));
    const next = { ...s, week, updatedAt: Date.now() };
    saveCache(uid, next);
    void upsertAppState(uid, next);
    set({ s: next });
  },

  toggleSet: (dayId, slotId, i) => {
    const { uid, s } = get();
    if (!uid) return;
    const progress = ensureDay(s.progress, dayId);
    const arr = [...progress[dayId][slotId]];
    arr[i] = !arr[i];
    progress[dayId] = { ...progress[dayId], [slotId]: arr };
    const next = { ...s, progress, updatedAt: Date.now() };
    saveCache(uid, next);
    void upsertAppState(uid, next);
    set({ s: next });
  },

  logVal: (slotId, k, v) => {
    const { uid, s } = get();
    if (!uid) return;
    const cur = s.log[slotId] || { reps: '', weight: '' };
    const entry = { ...cur, [k]: v };
    const log = { ...s.log, [slotId]: entry };
    const next = { ...s, log };
    saveCache(uid, next);
    set({ s: next });
    // The durable exercise-log row is written on Finish (see finishSession) so
    // bodyweight / timed moves record too, and each exercise logs at most once
    // per session. Here we only keep the draft (cache + live PR preview).
  },

  finishSession: (dayId) => {
    const { uid, s } = get();
    const d = dayById(dayId)!;
    const progress = ensureDay(s.progress, dayId);
    let done = 0;
    let total = 0;
    const exercises = d.ex.map((origEx) => {
      const e = resolvedExercise(s, dayId, origEx.id);
      const a = progress[dayId][origEx.id];
      const lg = s.log[origEx.id] || { reps: '', weight: '' };
      const setsDone = a.filter(Boolean).length;
      done += setsDone;
      total += e.sets;
      return {
        id: e.id, slot_id: origEx.id, name: e.name, focus: d.focus,
        sets_total: e.sets, sets_done: setsDone, reps: lg.reps, weight: lg.weight,
      };
    });
    const date = new Date().toISOString();
    const entry: Session = { dayId, name: d.name, date, done, total, exercises };
    // Keep the day's checkmarks after finishing so she can go back and verify
    // the workout (e.g. at the end of the week). "Reset" clears it for a fresh
    // start on the next session.
    const next: ResetState = {
      ...s,
      progress,
      history: [...s.history, entry],
      sessions: [entry, ...s.sessions],
      updatedAt: Date.now(),
    };
    if (uid) {
      saveCache(uid, next);
      void upsertAppState(uid, next);
      void insertSession(uid, {
        day_id: dayId, day_name: d.name, completed_at: date,
        done_sets: done, total_sets: total, exercises,
      });
      // One durable exercise-log row per exercise with any logged detail —
      // including bodyweight / timed moves (plank, dead bug) that carry reps or
      // a held duration but no weight (weight → null).
      exercises.forEach((e) => {
        const w = parseFloat(e.weight);
        const hasWeight = !isNaN(w);
        if (e.reps || hasWeight) {
          void insertExerciseLog(uid, {
            exercise_id: e.slot_id,
            reps: e.reps,
            weight: hasWeight ? w : null,
          });
        }
      });
    }
    set({ s: next });
    return { done, total, dayName: d.name, exercisesCompleted: exercises.filter((e) => e.sets_done === e.sets_total).length };
  },

  resetDay: (dayId) => {
    const { uid, s } = get();
    if (!uid) return;
    const d = dayById(dayId)!;
    const progress = ensureDay(s.progress, dayId);
    const clearedDay: Record<string, boolean[]> = {};
    d.ex.forEach((e) => { clearedDay[e.id] = new Array(e.sets).fill(false); });
    const next = { ...s, progress: { ...progress, [dayId]: clearedDay }, updatedAt: Date.now() };
    saveCache(uid, next);
    void upsertAppState(uid, next);
    set({ s: next });
  },

  confirmSwap: (dayId, slotId, altId) => {
    const { uid, s } = get();
    if (!uid) return;
    const swaps = { ...s.swaps, [dayId]: { ...(s.swaps[dayId] || {}), [slotId]: altId } };
    const next = { ...s, swaps, updatedAt: Date.now() };
    saveCache(uid, next);
    void upsertAppState(uid, next);
    set({ s: next });
  },

  restoreSwap: (dayId, slotId) => {
    const { uid, s } = get();
    if (!uid || !s.swaps[dayId]?.[slotId]) return;
    const dayMap = { ...s.swaps[dayId] };
    delete dayMap[slotId];
    const next = { ...s, swaps: { ...s.swaps, [dayId]: dayMap }, updatedAt: Date.now() };
    saveCache(uid, next);
    void upsertAppState(uid, next);
    set({ s: next });
  },

  saveVideo: (exId, url) => {
    const { uid, s } = get();
    if (!uid) return;
    const next = { ...s, videos: { ...s.videos, [exId]: url }, updatedAt: Date.now() };
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

// ── Pure selectors (take the state slice) ────────────────────────────────────
export function resolvedExercise(s: ResetState, dayId: string, exId: string): Exercise {
  const altId = s.swaps?.[dayId]?.[exId];
  if (altId) {
    const alt = exerciseById(altId);
    if (alt) return alt;
  }
  return exerciseById(exId)!;
}

export function dayCount(s: ResetState, dayId: string): { done: number; total: number; pct: number } {
  const d = dayById(dayId);
  if (!d) return { done: 0, total: 0, pct: 0 };
  let done = 0;
  let total = 0;
  d.ex.forEach((e) => {
    const a = s.progress[dayId]?.[e.id] || new Array(e.sets).fill(false);
    total += e.sets;
    done += a.filter(Boolean).length;
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
