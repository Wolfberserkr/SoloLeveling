import { create } from 'zustand';

export type SystemAlert = {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  body?: string;
};

type UiState = {
  alerts: SystemAlert[];
  levelUp: number | null; // level reached — triggers the full-screen sequence
  pushAlert: (alert: Omit<SystemAlert, 'id'>) => void;
  dismissAlert: (id: number) => void;
  showLevelUp: (level: number) => void;
  clearLevelUp: () => void;
};

let nextId = 1;

export const useUiStore = create<UiState>((set) => ({
  alerts: [],
  levelUp: null,
  pushAlert: (alert) =>
    set((s) => ({ alerts: [...s.alerts, { ...alert, id: nextId++ }].slice(-4) })),
  dismissAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  showLevelUp: (level) => set({ levelUp: level }),
  clearLevelUp: () => set({ levelUp: null }),
}));
