import type { DistanceUnit } from '@/stores/settingsStore';

const KM_PER_MILE = 1.609344;

/** Format a distance stored in kilometres for display in the player's unit. */
export function formatDistance(km: number, unit: DistanceUnit, digits = 1): string {
  return `${fromKm(km, unit).toFixed(digits)} ${unit}`;
}

/** Convert a stored-km distance into the player's display unit. */
export function fromKm(km: number, unit: DistanceUnit): number {
  return unit === 'mi' ? km / KM_PER_MILE : km;
}

/** Convert a value entered in the player's unit back to storage kilometres. */
export function toKm(value: number, unit: DistanceUnit): number {
  return unit === 'mi' ? value * KM_PER_MILE : value;
}
