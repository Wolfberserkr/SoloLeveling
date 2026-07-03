import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DistanceUnit = 'km' | 'mi';

type SettingsState = {
  /** UI feedback sounds (short synthesized chimes on alerts / level-up). */
  sound: boolean;
  /** Haptic feedback (vibration) on supported devices. */
  haptics: boolean;
  /** Display unit for distances. Storage stays in kilometres. */
  distanceUnit: DistanceUnit;
  /** Remembered SystemWindow collapse states, keyed by panel. Absent key
   * means the panel has never been toggled and uses its default. */
  panelCollapsed: Record<string, boolean>;
  /** Watch GPS while the app is open and trigger Field Zones on arrival. */
  zoneWatch: boolean;
  setSound: (on: boolean) => void;
  setHaptics: (on: boolean) => void;
  setDistanceUnit: (unit: DistanceUnit) => void;
  setPanelCollapsed: (key: string, collapsed: boolean) => void;
  setZoneWatch: (on: boolean) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      sound: false,
      haptics: true,
      distanceUnit: 'km',
      panelCollapsed: {},
      zoneWatch: false,
      setSound: (on) => set({ sound: on }),
      setHaptics: (on) => set({ haptics: on }),
      setDistanceUnit: (unit) => set({ distanceUnit: unit }),
      setPanelCollapsed: (key, collapsed) =>
        set((s) => ({ panelCollapsed: { ...s.panelCollapsed, [key]: collapsed } })),
      setZoneWatch: (on) => set({ zoneWatch: on }),
    }),
    { name: 'system-settings' },
  ),
);
