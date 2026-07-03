// ─────────────────────────────────────────────────────────────────────────────
// FIELD ZONES — GPS-triggered encounters at the Player's real places.
//
// The Player marks real locations as zones: the gym, the supply store, a
// landmark. Arriving inside a zone's radius (while the app is open — a web
// PWA cannot geofence in the background) rolls once per zone per day,
// deterministically per user+zone+date:
//   gym       40% a field monster blocks the door — a physical challenge
//             (cardio, sets) self-reported like a Gate, paying XP; the gym
//             rolls hottest — showing up should feel like entering a dungeon
//   store     25% a supply cache — a consumable, or a Hunter's Brand that
//             boosts all XP for 4 hours
//   landmark  25% a treasure — equipable gear or a consumable
// The roll is server-side; the client only reports presence. Same inputs,
// same outcome — retrying from the parking lot changes nothing.
//
// Pure TypeScript, shared client + server. No Deno/Node/DOM.
// ─────────────────────────────────────────────────────────────────────────────
import { dailyRng, pickWeighted } from './rng.ts';
import { CONSUMABLE_KEYS, GEAR_KEYS, ITEMS, RARITY_WEIGHT, XP_BOOSTER_KEY } from './items.ts';

export const ZONE_KINDS = ['gym', 'store', 'landmark'] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];

export const ZONE_KIND_META: Record<ZoneKind, { name: string; hint: string }> = {
  gym: { name: 'Training Grounds', hint: 'field monsters may block the door' },
  store: { name: 'Supply Post', hint: 'supply caches may surface' },
  landmark: { name: 'Landmark', hint: 'treasures may lie buried' },
};

/** Chance a visit triggers anything, per zone per day. The gym rolls
 * hottest — it is the place the Player most needs a reason to reach. */
export const ZONE_TRIGGER_CHANCES: Record<ZoneKind, number> = {
  gym: 0.4,
  store: 0.25,
  landmark: 0.25,
};

/** Zone radius bounds (meters). Small enough to mean "you are there". */
export const ZONE_RADIUS_MIN_M = 30;
export const ZONE_RADIUS_MAX_M = 500;
export const ZONE_RADIUS_DEFAULT_M = 100;

/** Server-side slack on top of the radius — consumer GPS wobbles. */
export const ZONE_GPS_SLACK_M = 75;

/** Max zones per player — each is a daily loot roll, so bound them. */
export const ZONE_LIMIT = 8;

export const ZONE_FIGHT_XP = 35;

export function clampZoneRadius(radius: number): number {
  if (!Number.isFinite(radius)) return ZONE_RADIUS_DEFAULT_M;
  return Math.max(ZONE_RADIUS_MIN_M, Math.min(ZONE_RADIUS_MAX_M, Math.round(radius)));
}

/** Great-circle distance in meters. Good to ~0.5% — plenty for geofences. */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Is a reading (lat,lng) inside the zone, allowing for GPS slack? */
export function insideZone(
  lat: number,
  lng: number,
  zoneLat: number,
  zoneLng: number,
  radiusM: number,
  slackM = ZONE_GPS_SLACK_M,
): boolean {
  if (![lat, lng, zoneLat, zoneLng].every(Number.isFinite)) return false;
  return haversineMeters(lat, lng, zoneLat, zoneLng) <= radiusM + slackM;
}

// Field monsters guard the gym door. All are cleared by doing physical work —
// the fight IS the warm-up.
export type ZoneFight = { monster: string; challenge: string };

export const ZONE_FIGHTS: ZoneFight[] = [
  { monster: 'Ash Hound', challenge: '10 minutes of steady cardio — outlast its stamina' },
  { monster: 'Iron Golem', challenge: '3 heavy sets of any compound lift — crack its armor' },
  { monster: 'Stone Boar', challenge: '50 bodyweight squats — break its charge' },
  { monster: 'Night Stalker', challenge: '30 push-ups + 30 sit-ups — drive it into the light' },
  { monster: 'Grave Wraith', challenge: '5 minutes of jump rope or high knees — it cannot hold a rhythm' },
];

export type ZoneTriggerRoll =
  | { kind: 'fight'; fight: ZoneFight; xpReward: number }
  | { kind: 'cache' | 'treasure'; items: Array<{ key: string; qty: number }> };

/**
 * The day's outcome for arriving at a zone, or null for a quiet visit.
 * Deterministic per user+zone+date — the roll happens when the Player
 * arrives, but the dice were cast at midnight.
 */
export function rollZoneTrigger(
  userId: string,
  zoneId: string,
  localDate: string,
  kind: ZoneKind,
): ZoneTriggerRoll | null {
  const rand = dailyRng(`${userId}|${zoneId}`, localDate, 'zone-trigger');
  if (rand() >= ZONE_TRIGGER_CHANCES[kind]) return null;

  switch (kind) {
    case 'gym': {
      const fight = ZONE_FIGHTS[Math.floor(rand() * ZONE_FIGHTS.length)];
      return { kind: 'fight', fight, xpReward: ZONE_FIGHT_XP };
    }
    case 'store': {
      // A supply cache: 40% the Hunter's Brand XP booster, else a consumable.
      const key =
        rand() < 0.4
          ? XP_BOOSTER_KEY
          : pickWeighted(rand, CONSUMABLE_KEYS, (k) => RARITY_WEIGHT[ITEMS[k].rarity]);
      return { kind: 'cache', items: [{ key, qty: 1 }] };
    }
    case 'landmark': {
      // Buried treasure: a 50/50 split between gear and a consumable.
      const pool = rand() < 0.5 ? GEAR_KEYS : CONSUMABLE_KEYS;
      const key = pickWeighted(rand, pool, (k) => RARITY_WEIGHT[ITEMS[k].rarity]);
      return { kind: 'treasure', items: [{ key, qty: 1 }] };
    }
  }
}

/** Announcement copy for a trigger, shared by push/alerts/system messages. */
export function zoneTriggerCopy(
  roll: ZoneTriggerRoll,
  zoneName: string,
): { title: string; body: string } {
  if (roll.kind === 'fight') {
    return {
      title: 'A FIELD MONSTER APPEARS.',
      body: `${roll.fight.monster} blocks the way into ${zoneName}. Defeat it: ${roll.fight.challenge}. +${roll.xpReward} XP — it slips away at midnight.`,
    };
  }
  const names = roll.items.map((i) => ITEMS[i.key]?.name ?? i.key).join(', ');
  if (roll.kind === 'cache') {
    return {
      title: 'SUPPLY CACHE SECURED.',
      body: `A cache surfaces at ${zoneName}: ${names}. Claimed to your inventory.`,
    };
  }
  return {
    title: 'TREASURE UNEARTHED.',
    body: `Something lay buried at ${zoneName}: ${names}. Claimed to your inventory.`,
  };
}
