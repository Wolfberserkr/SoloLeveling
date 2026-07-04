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
//   park      40% a monster prowls the open field — cardio challenges; like
//             the gym, an earned visit that deserves a hot roll
//   store     25% a supply cache — a consumable, or a Hunter's Brand that
//             boosts all XP for 4 hours
//   landmark  25% a treasure — equipable gear or a consumable
//   trail     35% a Treasure Trail strike — gear-biased loot plus Essence;
//             hikes are rare and physical, so they pay the richest
//   work      20% a mental trial — a specter banished by focused work or a
//             midday walk, paying XP with INT/DIS gains
//   home      20% a hearth blessing — restores mana, but only lands once the
//             day's Daily Quest is complete; home rewards a finished day
// Everyday places (home, work) roll cold and pay small; earned visits roll
// hot. The daily XP cap backstops the economy either way.
// The roll is server-side; the client only reports presence. Same inputs,
// same outcome — retrying from the parking lot changes nothing.
//
// Pure TypeScript, shared client + server. No Deno/Node/DOM.
// ─────────────────────────────────────────────────────────────────────────────
import { dailyRng, pickWeighted } from './rng.ts';
import { CONSUMABLE_KEYS, GEAR_KEYS, ITEMS, RARITY_WEIGHT, XP_BOOSTER_KEY } from './items.ts';

export const ZONE_KINDS = ['gym', 'park', 'store', 'landmark', 'trail', 'work', 'home'] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];

export const ZONE_KIND_META: Record<ZoneKind, { name: string; hint: string }> = {
  gym: { name: 'Training Grounds', hint: 'field monsters may block the door' },
  park: { name: 'Hunting Grounds', hint: 'monsters prowl the open field' },
  store: { name: 'Supply Post', hint: 'supply caches may surface' },
  landmark: { name: 'Landmark', hint: 'treasures may lie buried' },
  trail: { name: 'Treasure Trail', hint: 'rich treasure waits at the far end' },
  work: { name: 'Duty Post', hint: 'mental trials strike at midday' },
  home: { name: 'Sanctuary', hint: 'the hearth blesses a finished day' },
};

/** Chance a visit triggers anything, per zone per day. Earned visits (gym,
 * park, trail) roll hot; everyday places (home, work) roll cold and small. */
export const ZONE_TRIGGER_CHANCES: Record<ZoneKind, number> = {
  gym: 0.4,
  park: 0.4,
  store: 0.25,
  landmark: 0.25,
  trail: 0.35,
  work: 0.2,
  home: 0.2,
};

/** Zone radius bounds (meters). Small enough to mean "you are there". */
export const ZONE_RADIUS_MIN_M = 30;
export const ZONE_RADIUS_MAX_M = 500;
export const ZONE_RADIUS_DEFAULT_M = 100;

/** Server-side slack on top of the radius — consumer GPS wobbles. */
export const ZONE_GPS_SLACK_M = 75;

/** Max zones per player — each is a daily loot roll, so bound them. Room
 * for the daily loop (gym, home, work, store) plus a handful of trails. */
export const ZONE_LIMIT = 12;

export const ZONE_FIGHT_XP = 35;
export const ZONE_TRIAL_XP = 25;
export const HOME_BLESSING_MANA = 15;
export const TRAIL_ESSENCE = 2;

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

// Hunting Grounds monsters live in the open — cardio in the field.
export const PARK_FIGHTS: ZoneFight[] = [
  { monster: 'Dune Serpent', challenge: '15 minutes jogging the paths — it cannot match your pace' },
  { monster: 'Wind Harpy', challenge: '6 × 30-second sprint intervals — steal the wind from it' },
  { monster: 'Mossback Troll', challenge: 'a brisk 20-minute walk, head up and shoulders back' },
  { monster: 'Feral Shade', challenge: '10 hill or stair climbs — it tires on the ascent' },
];

// Duty Post specters are banished with focus, not force.
export const WORK_TRIALS: ZoneFight[] = [
  { monster: 'Doubt Specter', challenge: '10 minutes walking outside — shake its grip' },
  { monster: 'Deadline Wraith', challenge: '25 minutes of deep work, phone out of reach' },
  { monster: 'Torpor Slime', challenge: '20 desk push-ups or 5 flights of stairs — burn it off' },
  { monster: 'Murmur Imp', challenge: 'clear your three oldest small tasks — starve its whispers' },
];

export type ZoneTriggerRoll =
  | { kind: 'fight'; fight: ZoneFight; xpReward: number; mode: 'physical' | 'mental' }
  | { kind: 'cache' | 'treasure'; items: Array<{ key: string; qty: number }>; essence?: number }
  | { kind: 'blessing'; mana: number };

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
      return { kind: 'fight', fight, xpReward: ZONE_FIGHT_XP, mode: 'physical' };
    }
    case 'park': {
      const fight = PARK_FIGHTS[Math.floor(rand() * PARK_FIGHTS.length)];
      return { kind: 'fight', fight, xpReward: ZONE_FIGHT_XP, mode: 'physical' };
    }
    case 'work': {
      const fight = WORK_TRIALS[Math.floor(rand() * WORK_TRIALS.length)];
      return { kind: 'fight', fight, xpReward: ZONE_TRIAL_XP, mode: 'mental' };
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
    case 'trail': {
      // Trail treasure is the richest strike: gear-biased loot plus Essence —
      // a hike is the most physical way to loot anything.
      const pool = rand() < 0.6 ? GEAR_KEYS : CONSUMABLE_KEYS;
      const key = pickWeighted(rand, pool, (k) => RARITY_WEIGHT[ITEMS[k].rarity]);
      return { kind: 'treasure', items: [{ key, qty: 1 }], essence: TRAIL_ESSENCE };
    }
    case 'home':
      return { kind: 'blessing', mana: HOME_BLESSING_MANA };
  }
}

/** Announcement copy for a trigger, shared by push/alerts/system messages. */
export function zoneTriggerCopy(
  roll: ZoneTriggerRoll,
  zoneName: string,
): { title: string; body: string } {
  if (roll.kind === 'fight') {
    if (roll.mode === 'mental') {
      return {
        title: 'A SPECTER HAUNTS YOUR POST.',
        body: `${roll.fight.monster} clouds ${zoneName}. Banish it: ${roll.fight.challenge}. +${roll.xpReward} XP — gone at midnight.`,
      };
    }
    return {
      title: 'A FIELD MONSTER APPEARS.',
      body: `${roll.fight.monster} blocks the way into ${zoneName}. Defeat it: ${roll.fight.challenge}. +${roll.xpReward} XP — it slips away at midnight.`,
    };
  }
  if (roll.kind === 'blessing') {
    return {
      title: 'THE HEARTH ACCEPTS.',
      body: `${zoneName} recognizes a finished day. +${roll.mana} mana — rest is also training.`,
    };
  }
  const names = roll.items.map((i) => ITEMS[i.key]?.name ?? i.key).join(', ');
  if (roll.kind === 'cache') {
    return {
      title: 'SUPPLY CACHE SECURED.',
      body: `A cache surfaces at ${zoneName}: ${names}. Claimed to your inventory.`,
    };
  }
  const essence = roll.essence ? ` +${roll.essence} Essence.` : '';
  return {
    title: 'TREASURE UNEARTHED.',
    body: `Something lay buried at ${zoneName}: ${names}.${essence} Claimed to your inventory.`,
  };
}

// ── Treasure Trails — Aruba ──────────────────────────────────────────────────
// Curated hike destinations the Player can add with one tap. Radii are
// generous (these are outdoor areas, and pins carry map imprecision) and the
// zone stays editable/deletable like any other. Coordinates are the widely
// mapped spots for each site — verify on arrival and re-mark on location if
// one sits off; a saved zone always beats the preset.
export type TrailPreset = {
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  note: string;
};

export const ARUBA_TRAILS: TrailPreset[] = [
  {
    name: 'Hooiberg Steps',
    lat: 12.5075, lng: -69.9958, radius_m: 300,
    note: '~600 steps up the Haystack — the whole island from the top',
  },
  {
    name: 'Arikok National Park',
    lat: 12.4922, lng: -69.9426, radius_m: 400,
    note: 'visitor center trailheads — Cunucu Arikok and Sero Jamanota',
  },
  {
    name: 'Conchi Natural Pool Trail',
    lat: 12.5203, lng: -69.9077, radius_m: 400,
    note: 'the rugged hike or ride to the volcanic-rock pool',
  },
  {
    name: 'California Lighthouse Dunes',
    lat: 12.6167, lng: -70.0517, radius_m: 300,
    note: 'Hudishibana white dunes below the lighthouse',
  },
  {
    name: 'Alto Vista Chapel Route',
    lat: 12.5931, lng: -70.0292, radius_m: 300,
    note: 'the pilgrims’ route past the white crosses',
  },
  {
    name: 'Ayo Rock Formations',
    lat: 12.5561, lng: -69.9764, radius_m: 250,
    note: 'trails winding between the monolithic boulders',
  },
  {
    name: 'Casibari Boulders',
    lat: 12.5366, lng: -69.9862, radius_m: 250,
    note: 'the short scramble to the lookout',
  },
  {
    name: 'Bushiribana Gold Mill Ruins',
    lat: 12.5772, lng: -69.9689, radius_m: 300,
    note: 'gold-rush ruins on the wild north coast',
  },
  {
    name: 'Quadirikiri Caves',
    lat: 12.4667, lng: -69.8814, radius_m: 400,
    note: 'sunlit chambers on Arikok’s eastern edge',
  },
  {
    name: 'Frenchman’s Pass',
    lat: 12.4826, lng: -69.9400, radius_m: 300,
    note: 'the haunted pass above Spanish Lagoon',
  },
];
