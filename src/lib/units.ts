import type { DistanceUnit } from '@/stores/settingsStore';

const KM_PER_MILE = 1.609344;

/** Format a distance stored in kilometres for display in the player's unit. */
export function formatDistance(km: number, unit: DistanceUnit, digits = 1): string {
  const value = unit === 'mi' ? km / KM_PER_MILE : km;
  return `${value.toFixed(digits)} ${unit}`;
}
