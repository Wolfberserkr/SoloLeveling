import { create } from 'zustand';

export type SystemAlert = {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  body?: string;
};

/** A full-screen cinematic takeover. The queue plays them one at a time. */
export type Cinematic =
  | { id: number; kind: 'level'; level: number }
  | { id: number; kind: 'rank'; rank: string };

type UiState = {
  alerts: SystemAlert[];
  cinematics: Cinematic[]; // index 0 is on screen; the rest are queued
  pushAlert: (alert: Omit<SystemAlert, 'id'>) => void;
  dismissAlert: (id: number) => void;
  showLevelUp: (level: number) => void;
  showRankUp: (rank: string) => void;
  advanceCinematic: () => void;
};

let nextId = 1;

export const useUiStore = create<UiState>((set) => ({
  alerts: [],
  cinematics: [],
  pushAlert: (alert) =>
    set((s) => ({ alerts: [...s.alerts, { ...alert, id: nextId++ }].slice(-4) })),
  dismissAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  showLevelUp: (level) =>
    set((s) => ({ cinematics: [...s.cinematics, { id: nextId++, kind: 'level', level }] })),
  showRankUp: (rank) =>
    set((s) => ({ cinematics: [...s.cinematics, { id: nextId++, kind: 'rank', rank }] })),
  advanceCinematic: () => set((s) => ({ cinematics: s.cinematics.slice(1) })),
}));
