import { describe, it, expect } from 'vitest';
import {
  rollSystemEvent,
  gateChallenge,
  trainingXpWithEvent,
  sideQuestCostWithEvent,
  EVENT_SLOT_CHANCES,
  EVENT_SLOTS,
  XP_SURGE_MULT,
  SYSTEM_EVENT_KINDS,
} from '@game/events.ts';
import { mulberry32 } from '@game/rng.ts';
import { GATE_CLEAR_XP, RIDDLE_SOLVE_XP, TRAINING_XP } from '@game/constants.ts';
import { RIDDLE_MAX_ATTEMPTS } from '@game/riddles.ts';

describe('system event roll', () => {
  it('is deterministic for the same user, date, and slot', () => {
    for (let i = 0; i < 20; i++) {
      for (let slot = 1; slot <= EVENT_SLOTS; slot++) {
        const a = rollSystemEvent(`user-${i}`, '2026-06-12', 10, slot);
        const b = rollSystemEvent(`user-${i}`, '2026-06-12', 10, slot);
        expect(a).toEqual(b);
      }
    }
  });

  it('slot 1 spawns every day — the System never goes dark', () => {
    for (let i = 0; i < 200; i++) {
      const date = `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
      expect(rollSystemEvent(`user-${i}`, date, 10, 1)).not.toBeNull();
    }
  });

  it('slot 2 spawns on roughly half of days', () => {
    let events = 0;
    const days = 2000;
    for (let i = 0; i < days; i++) {
      const date = `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
      if (rollSystemEvent(`user-${i}`, date, 10, 2)) events += 1;
    }
    const rate = events / days;
    expect(rate).toBeGreaterThan(EVENT_SLOT_CHANCES[1] - 0.05);
    expect(rate).toBeLessThan(EVENT_SLOT_CHANCES[1] + 0.05);
  });

  it('slots roll independently — the second is not a copy of the first', () => {
    let differed = false;
    for (let i = 0; i < 50 && !differed; i++) {
      const first = rollSystemEvent(`user-${i}`, '2026-06-12', 10, 1);
      const second = rollSystemEvent(`user-${i}`, '2026-06-12', 10, 2);
      if (second && second.kind !== first?.kind) differed = true;
    }
    expect(differed).toBe(true);
  });

  it('never rolls an excluded kind', () => {
    for (let i = 0; i < 300; i++) {
      const first = rollSystemEvent(`user-${i}`, '2026-06-12', 10, 1);
      expect(first).not.toBeNull();
      const second = rollSystemEvent(`user-${i}`, '2026-06-12', 10, 2, [first!.kind]);
      if (second) expect(second.kind).not.toBe(first!.kind);
    }
  });

  it('returns null when every kind is excluded', () => {
    // Slot 1 always passes the chance roll, so this exercises the empty pool.
    expect(
      rollSystemEvent('user-1', '2026-06-12', 10, 1, [...SYSTEM_EVENT_KINDS]),
    ).toBeNull();
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
      } else if (roll.kind === 'riddle') {
        expect(roll.xpReward).toBe(RIDDLE_SOLVE_XP);
        expect(roll.payload.max_attempts).toBe(RIDDLE_MAX_ATTEMPTS);
        expect(roll.riddle?.prompt).toBeTruthy();
        expect(roll.riddle?.answer).toBeTruthy();
        expect(roll.body).toContain(roll.riddle!.prompt);
      } else {
        expect(roll.xpReward).toBe(0);
      }
    }
    expect([...seen].sort()).toEqual([...SYSTEM_EVENT_KINDS].sort());
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
    expect(trainingXpWithEvent(TRAINING_XP, ['xp_surge'])).toBe(
      Math.round(TRAINING_XP * XP_SURGE_MULT),
    );
    expect(trainingXpWithEvent(TRAINING_XP, ['gate', 'xp_surge'])).toBe(
      Math.round(TRAINING_XP * XP_SURGE_MULT),
    );
    expect(trainingXpWithEvent(TRAINING_XP, ['gate'])).toBe(TRAINING_XP);
    expect(trainingXpWithEvent(TRAINING_XP, [])).toBe(TRAINING_XP);
  });

  it('mana_surge waives side-quest costs; nothing else does', () => {
    expect(sideQuestCostWithEvent(20, ['mana_surge'])).toBe(0);
    expect(sideQuestCostWithEvent(20, ['riddle', 'mana_surge'])).toBe(0);
    expect(sideQuestCostWithEvent(20, ['xp_surge'])).toBe(20);
    expect(sideQuestCostWithEvent(20, [])).toBe(20);
  });
});
