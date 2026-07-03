import { create } from 'zustand';

export type SystemAlert = {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  body?: string;
};

/** A floating "+N XP" that rises from where the player earned it. */
export type XpBurst = { id: number; amount: number; x: number; y: number };

/** Full-screen cinematic moments beyond the level-up sequence. */
export type TakeoverKind = 'perfect' | 'boss' | 'arise';
export type Takeover = { kind: TakeoverKind; title: string; subtitle?: string };

type UiState = {
  alerts: SystemAlert[];
  levelUp: number | null; // level reached — triggers the full-screen sequence
  xpBursts: XpBurst[];
  takeover: Takeover | null;
  pushAlert: (alert: Omit<SystemAlert, 'id'>) => void;
  dismissAlert: (id: number) => void;
  showLevelUp: (level: number) => void;
  clearLevelUp: () => void;
  /** Float "+amount XP" from `at` (viewport px); defaults near screen center. */
  burstXp: (amount: number, at?: { x: number; y: number }) => void;
  removeXpBurst: (id: number) => void;
  showTakeover: (takeover: Takeover) => void;
  clearTakeover: () => void;
};

let nextId = 1;

export const useUiStore = create<UiState>((set) => ({
  alerts: [],
  levelUp: null,
  xpBursts: [],
  takeover: null,
  pushAlert: (alert) =>
    set((s) => ({ alerts: [...s.alerts, { ...alert, id: nextId++ }].slice(-4) })),
  dismissAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  showLevelUp: (level) => set({ levelUp: level }),
  clearLevelUp: () => set({ levelUp: null }),
  burstXp: (amount, at) => {
    if (amount <= 0) return;
    const x = at?.x ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 200);
    const y = at?.y ?? (typeof window !== 'undefined' ? window.innerHeight * 0.4 : 200);
    set((s) => ({ xpBursts: [...s.xpBursts, { id: nextId++, amount, x, y }].slice(-8) }));
  },
  removeXpBurst: (id) => set((s) => ({ xpBursts: s.xpBursts.filter((b) => b.id !== id) })),
  showTakeover: (takeover) => set({ takeover }),
  clearTakeover: () => set({ takeover: null }),
}));
