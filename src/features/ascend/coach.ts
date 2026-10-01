// The Ascend Coach: calls the read-only `ascend` edge function (Gemini) and
// keeps the last answers around, so closing the sheet to add a suggested
// quest doesn't lose the rest of the list.
import { create } from 'zustand';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type CoachTab = 'quests' | 'boss' | 'review';
export interface Suggestion { title: string; type: 'daily' | 'side'; statId: string; subId: string | null; xp: number; why: string }
export interface BossPick { bossId: string | null; reason: string; firstStep: string }
export interface ReviewNote { reviewId: string; text: string }

const TIMEOUT_MS = 30_000;

async function call<T>(action: CoachTab, payload?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { data, error } = await supabase.functions.invoke<T>('ascend', { body: { action, payload }, signal: controller.signal });
    if (error) {
      let message = error.message;
      if (error instanceof FunctionsHttpError) {
        try { const body = await error.context.json(); if (body?.error) message = body.error; } catch { /* keep generic */ }
      }
      throw new Error(message);
    }
    return data as T;
  } catch (e) {
    if (controller.signal.aborted) throw new Error('The Coach took too long to answer. Try again.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

interface CoachState {
  tab: CoachTab;
  goal: string;
  busy: CoachTab | null;
  error: string | null;
  suggestions: Suggestion[] | null;
  added: number[];
  boss: BossPick | null;
  review: ReviewNote | null;
  setTab: (t: CoachTab) => void;
  setGoal: (g: string) => void;
  markAdded: (i: number) => void;
  askQuests: () => Promise<void>;
  askBoss: () => Promise<void>;
  askReview: () => Promise<void>;
}

export const useCoach = create<CoachState>((set, get) => {
  async function run<T>(tab: CoachTab, fn: () => Promise<T>, apply: (r: T) => Partial<CoachState>) {
    if (get().busy) return;
    set({ busy: tab, error: null });
    try {
      const r = await fn();
      set({ ...apply(r), busy: null });
    } catch (e) {
      set({ busy: null, error: e instanceof Error ? e.message : 'The Coach is unavailable right now.' });
    }
  }
  return {
    tab: 'quests', goal: '', busy: null, error: null, suggestions: null, added: [], boss: null, review: null,
    setTab: (tab) => set({ tab, error: null }),
    setGoal: (goal) => set({ goal }),
    markAdded: (i) => set((s) => ({ added: [...s.added, i] })),
    askQuests: () => run('quests', () => call<{ suggestions: Suggestion[] }>('quests', { goal: get().goal }),
      (r) => ({ suggestions: r.suggestions ?? [], added: [], error: r.suggestions?.length ? null : 'The Coach had no ideas this time. Try rewording the goal.' })),
    askBoss: () => run('boss', () => call<BossPick>('boss'),
      (r) => ({ boss: r, error: r.bossId ? null : 'The Coach could not pick one this time. Try again.' })),
    askReview: () => run('review', () => call<ReviewNote>('review'),
      (r) => ({ review: r, error: r.text ? null : 'The Coach had nothing to add this time. Try again.' })),
  };
});
