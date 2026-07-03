import { describe, it, expect } from 'vitest';
import {
  haversineMeters,
  insideZone,
  clampZoneRadius,
  rollZoneTrigger,
  zoneTriggerCopy,
  ZONE_TRIGGER_CHANCES,
  ZONE_RADIUS_MIN_M,
  ZONE_RADIUS_MAX_M,
  ZONE_RADIUS_DEFAULT_M,
  ZONE_GPS_SLACK_M,
  ZONE_FIGHT_XP,
  ZONE_FIGHTS,
  ZONE_KINDS,
} from '@game/zones.ts';
import { ITEMS, XP_BOOSTER_KEY, itemXpMultiplier, isConsumable, isGear } from '@game/items.ts';

// Oranjestad, Aruba — the founding Player's home turf.
const GYM = { lat: 12.5186, lng: -70.0358 };

describe('haversine distance', () => {
  it('is zero for identical points and symmetric', () => {
    expect(haversineMeters(GYM.lat, GYM.lng, GYM.lat, GYM.lng)).toBe(0);
    const d1 = haversineMeters(GYM.lat, GYM.lng, 12.52, -70.04);
    const d2 = haversineMeters(12.52, -70.04, GYM.lat, GYM.lng);
    expect(d1).toBeCloseTo(d2, 6);
  });

  it('matches a known distance: ~111 km per degree of latitude', () => {
    const d = haversineMeters(12, -70, 13, -70);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_500);
  });

  it('a city block (~100 m) reads as ~100 m', () => {
    // 0.0009° of latitude ≈ 100 m.
    const d = haversineMeters(GYM.lat, GYM.lng, GYM.lat + 0.0009, GYM.lng);
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(110);
  });
});

describe('insideZone', () => {
  it('accepts inside, rejects far away, honors GPS slack', () => {
    expect(insideZone(GYM.lat, GYM.lng, GYM.lat, GYM.lng, 100)).toBe(true);
    // ~150 m out: outside a 100 m radius alone, inside with the default slack.
    const nearLat = GYM.lat + 0.00135;
    expect(insideZone(nearLat, GYM.lng, GYM.lat, GYM.lng, 100, 0)).toBe(false);
    expect(insideZone(nearLat, GYM.lng, GYM.lat, GYM.lng, 100, ZONE_GPS_SLACK_M)).toBe(true);
    // 1 km out: never inside.
    expect(insideZone(GYM.lat + 0.009, GYM.lng, GYM.lat, GYM.lng, 100)).toBe(false);
  });

  it('rejects non-finite coordinates', () => {
    expect(insideZone(NaN, GYM.lng, GYM.lat, GYM.lng, 100)).toBe(false);
    expect(insideZone(GYM.lat, GYM.lng, Infinity, GYM.lng, 100)).toBe(false);
  });
});

describe('zone radius clamp', () => {
  it('clamps into the honest band and defaults junk', () => {
    expect(clampZoneRadius(10)).toBe(ZONE_RADIUS_MIN_M);
    expect(clampZoneRadius(10_000)).toBe(ZONE_RADIUS_MAX_M);
    expect(clampZoneRadius(150)).toBe(150);
    expect(clampZoneRadius(NaN)).toBe(ZONE_RADIUS_DEFAULT_M);
  });
});

describe('zone trigger roll', () => {
  it('is deterministic per user+zone+date', () => {
    for (let i = 0; i < 20; i++) {
      for (const kind of ZONE_KINDS) {
        const a = rollZoneTrigger('user-1', `zone-${i}`, '2026-07-03', kind);
        const b = rollZoneTrigger('user-1', `zone-${i}`, '2026-07-03', kind);
        expect(a).toEqual(b);
      }
    }
  });

  it('fires at each kind’s own rate — the gym rolls hottest', () => {
    expect(ZONE_TRIGGER_CHANCES.gym).toBeGreaterThan(ZONE_TRIGGER_CHANCES.store);
    for (const kind of ZONE_KINDS) {
      let hits = 0;
      const days = 2000;
      for (let i = 0; i < days; i++) {
        const date = `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
        if (rollZoneTrigger(`user-${i}`, `zone-${kind}`, date, kind)) hits += 1;
      }
      const rate = hits / days;
      expect(rate).toBeGreaterThan(ZONE_TRIGGER_CHANCES[kind] - 0.04);
      expect(rate).toBeLessThan(ZONE_TRIGGER_CHANCES[kind] + 0.04);
    }
  });

  it('gym zones spawn fights from the bank with the fight XP', () => {
    for (let i = 0; i < 500; i++) {
      const roll = rollZoneTrigger(`user-${i}`, 'zone-gym', '2026-07-03', 'gym');
      if (!roll) continue;
      expect(roll.kind).toBe('fight');
      if (roll.kind === 'fight') {
        expect(roll.xpReward).toBe(ZONE_FIGHT_XP);
        expect(ZONE_FIGHTS.some((f) => f.monster === roll.fight.monster)).toBe(true);
      }
    }
  });

  it('store zones drop the XP booster or a consumable — never gear', () => {
    let boosters = 0;
    let hits = 0;
    for (let i = 0; i < 3000; i++) {
      const roll = rollZoneTrigger(`user-${i}`, 'zone-store', '2026-07-03', 'store');
      if (!roll) continue;
      hits += 1;
      expect(roll.kind).toBe('cache');
      if (roll.kind === 'cache') {
        const key = roll.items[0].key;
        if (key === XP_BOOSTER_KEY) boosters += 1;
        else expect(isConsumable(key)).toBe(true);
      }
    }
    // The signature find shows up meaningfully often (40% of hits).
    expect(boosters / hits).toBeGreaterThan(0.25);
    expect(boosters / hits).toBeLessThan(0.55);
  });

  it('landmark treasure is either gear or a consumable, both valid items', () => {
    let gear = 0;
    let hits = 0;
    for (let i = 0; i < 3000; i++) {
      const roll = rollZoneTrigger(`user-${i}`, 'zone-lm', '2026-07-03', 'landmark');
      if (!roll) continue;
      hits += 1;
      expect(roll.kind).toBe('treasure');
      if (roll.kind === 'treasure') {
        const key = roll.items[0].key;
        expect(ITEMS[key]).toBeTruthy();
        if (isGear(key)) gear += 1;
        else expect(isConsumable(key)).toBe(true);
      }
    }
    expect(gear / hits).toBeGreaterThan(0.35);
    expect(gear / hits).toBeLessThan(0.65);
  });

  it('produces announcement copy naming the zone and the reward', () => {
    for (let i = 0; i < 200; i++) {
      for (const kind of ZONE_KINDS) {
        const roll = rollZoneTrigger(`user-${i}`, `zone-${kind}`, '2026-07-03', kind);
        if (!roll) continue;
        const copy = zoneTriggerCopy(roll, 'Powerhouse Gym');
        expect(copy.title.length).toBeGreaterThan(0);
        expect(copy.body).toContain('Powerhouse Gym');
        if (roll.kind !== 'fight') {
          expect(copy.body).toContain(ITEMS[roll.items[0].key].name);
        }
      }
    }
  });
});

describe("Hunter's Brand — the 4h XP booster", () => {
  it('is rare gear with a 4h duration and no stat affinity', () => {
    const def = ITEMS[XP_BOOSTER_KEY];
    expect(def.category).toBe('gear');
    expect(def.durationHours).toBe(4);
    expect(def.xpMult).toBe(1.5);
    expect(def.affinity).toBeUndefined();
  });

  it('multiplies XP only while equipped, and stacks if doubled', () => {
    expect(itemXpMultiplier([])).toBe(1);
    expect(itemXpMultiplier(['gauntlet_of_might'])).toBe(1);
    expect(itemXpMultiplier([XP_BOOSTER_KEY])).toBe(1.5);
    expect(itemXpMultiplier([XP_BOOSTER_KEY, 'gauntlet_of_might'])).toBe(1.5);
    expect(itemXpMultiplier([XP_BOOSTER_KEY, XP_BOOSTER_KEY])).toBe(2.25);
  });
});
