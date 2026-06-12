import { describe, it, expect } from 'vitest';
import {
  rollSystemEvent,
  gateChallenge,
  trainingXpWithEvent,
  sideQuestCostWithEvent,
  eventChance,
  EVENT_CHANCE,
  PITY_QUIET_DAYS,
  XP_SURGE_MULT,
  SYSTEM_EVENT_KINDS,
} from '@game/events.ts';
import { mulberry32 } from '@game/rng.ts';
import { GATE_CLEAR_XP, TRAINING_XP } from '@game/constants.ts';

describe('system event roll', () => {
  it('is deterministic for the same user and date', () => {
    for (let i = 0; i < 20; i++) {
      const a = rollSystemEvent(`user-${i}`, '2026-06-12', 10);
      const b = rollSystemEvent(`user-${i}`, '2026-06-12', 10);
      expect(a).toEqual(b);
    }
  });

  it('spawns on roughly EVENT_CHANCE of days', () => {
    let events = 0;
    const days = 2000;
    for (let i = 0; i < days; i++) {
      const date = `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
      if (rollSystemEvent(`user-${i}`, date, 10)) events += 1;
    }
    const rate = events / days;
    expect(rate).toBeGreaterThan(EVENT_CHANCE - 0.05);
    expect(rate).toBeLessThan(EVENT_CHANCE + 0.05);
  });

  it('every kind in the pool actually spawns, with valid content', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 3000 && seen.size < SYSTEM_EVENT_KINDS.length; i++) {
      const roll = rollSystemEvent(`user-${i}`, '2026-06-12', 10);
      if (!roll) continue;
      seen.add(roll.kind);
      expect(roll.title.length).toBeGreaterThan(0);
      expect(roll.body.length).toBeGreaterThan(0);
      if (roll.kind === 'gate') {
        expect(roll.xpReward).toBe(GATE_CLEAR_XP);
        expect(roll.payload.label).toBeTruthy();
      } else {
        expect(roll.xpReward).toBe(0);
      }
    }
    expect([...seen].sort()).toEqual([...SYSTEM_EVENT_KINDS].sort());
  });
});

describe('pity timer', () => {
  it('ramps the spawn chance as quiet days accumulate', () => {
    expect(eventChance(0)).toBe(EVENT_CHANCE);
    expect(eventChance(PITY_QUIET_DAYS - 3)).toBe(EVENT_CHANCE);
    expect(eventChance(PITY_QUIET_DAYS - 2)).toBe(0.5);
    expect(eventChance(PITY_QUIET_DAYS - 1)).toBe(0.5);
    expect(eventChance(PITY_QUIET_DAYS)).toBe(1);
  });

  it('guarantees an event after a full quiet streak, for any user', () => {
    for (let i = 0; i < 100; i++) {
      expect(rollSystemEvent(`user-${i}`, '2026-06-13', 5, PITY_QUIET_DAYS)).not.toBeNull();
    }
  });
});

describe('gate challenges', () => {
  it('scale with level and respect caps', () => {
    const rand = () => 0; // always the first gate type (push-ups)
    expect(gateChallenge(rand, 1).target).toBe(40);
    expect(gateChallenge(rand, 10).target).toBe(67);
    expect(gateChallenge(rand, 99).target).toBe(150); // capped
  });

  it('produce a human label embedding the target', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      const gate = gateChallenge(rng, 12);
      expect(gate.label.length).toBeGreaterThan(10);
      expect(gate.target).toBeGreaterThan(0);
    }
  });
});

describe('passive event effects', () => {
  it('xp_surge amplifies training XP by the multiplier', () => {
    expect(trainingXpWithEvent(TRAINING_XP, 'xp_surge')).toBe(
      Math.round(TRAINING_XP * XP_SURGE_MULT),
    );
    expect(trainingXpWithEvent(TRAINING_XP, 'gate')).toBe(TRAINING_XP);
    expect(trainingXpWithEvent(TRAINING_XP, null)).toBe(TRAINING_XP);
  });

  it('mana_surge waives side-quest costs; nothing else does', () => {
    expect(sideQuestCostWithEvent(20, 'mana_surge')).toBe(0);
    expect(sideQuestCostWithEvent(20, 'xp_surge')).toBe(20);
    expect(sideQuestCostWithEvent(20, null)).toBe(20);
  });
});
