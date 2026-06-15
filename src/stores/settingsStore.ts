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
  setSound: (on: boolean) => void;
  setHaptics: (on: boolean) => void;
  setDistanceUnit: (unit: DistanceUnit) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      sound: false,
      haptics: true,
      distanceUnit: 'km',
      setSound: (on) => set({ sound: on }),
      setHaptics: (on) => set({ haptics: on }),
      setDistanceUnit: (unit) => set({ distanceUnit: unit }),
    }),
    { name: 'system-settings' },
  ),
);
