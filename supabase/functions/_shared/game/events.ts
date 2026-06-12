// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM EVENTS — Phase 5. The System is not a calendar; it interrupts.
//
// Each day has a chance of one random event, rolled deterministically per
// user+date (idempotent — the lazy daily reset and the cron tick can both
// ensure it without double-spawning):
//   gate         a 24h bonus challenge scaled to level; clearing pays XP
//   mana_surge   side quests cost no mana until midnight
//   xp_surge     Daily Training Quest XP +50% today
//   potion_gift  a Mana Potion materializes — the System rewards persistence
// Passive events simply apply all day; only gates are completed by hand.
// ─────────────────────────────────────────────────────────────────────────────
import { dailyRng, pickWeighted } from './rng.ts';
import { GATE_CLEAR_XP } from './constants.ts';

export const SYSTEM_EVENT_KINDS = ['gate', 'mana_surge', 'xp_surge', 'potion_gift'] as const;
export type SystemEventKind = (typeof SYSTEM_EVENT_KINDS)[number];

/** Chance that any given day spawns an event. */
export const EVENT_CHANCE = 0.25;

/** Training XP multiplier while an xp_surge is active. */
export const XP_SURGE_MULT = 1.5;

const KIND_WEIGHTS: Array<{ kind: SystemEventKind; weight: number }> = [
  { kind: 'gate', weight: 40 },
  { kind: 'mana_surge', weight: 25 },
  { kind: 'xp_surge', weight: 25 },
  { kind: 'potion_gift', weight: 10 },
];

// Gate challenges scale with level and are capped so they stay clearable
// inside a normal day on top of the regular quest load.
type GateType = {
  key: string;
  base: number;
  perLevel: number;
  cap: number;
  label: (target: number) => string;
};

const GATE_TYPES: GateType[] = [
  {
    key: 'pushup_gate',
    base: 40,
    perLevel: 3,
    cap: 150,
    label: (t) => `${t} push-ups — any sets, before midnight`,
  },
  {
    key: 'squat_gate',
    base: 50,
    perLevel: 4,
    cap: 200,
    label: (t) => `${t} bodyweight squats — any sets, before midnight`,
  },
  {
    key: 'run_gate',
    base: 20,
    perLevel: 2,
    cap: 100,
    label: (t) => `${(t / 10).toFixed(1)} km — walk or run, before midnight`,
  },
  {
    key: 'burpee_gate',
    base: 25,
    perLevel: 2,
    cap: 100,
    label: (t) => `${t} burpees — any sets, before midnight`,
  },
];

export type GateChallenge = { challenge: string; target: number; label: string };

export function gateChallenge(rand: () => number, level: number): GateChallenge {
  const type = GATE_TYPES[Math.floor(rand() * GATE_TYPES.length)];
  const target = Math.min(type.cap, type.base + type.perLevel * Math.max(0, level - 1));
  return { challenge: type.key, target, label: type.label(target) };
}

export type SystemEventRoll = {
  kind: SystemEventKind;
  title: string;
  body: string;
  xpReward: number;
  payload: Record<string, unknown>;
};

/** Today's event for a user, or null (~75% of days). Same inputs, same roll. */
export function rollSystemEvent(
  userId: string,
  localDate: string,
  level: number,
): SystemEventRoll | null {
  const rand = dailyRng(userId, localDate, 'system-event');
  if (rand() >= EVENT_CHANCE) return null;

  const kind = pickWeighted(rand, KIND_WEIGHTS, (k) => k.weight).kind;
  switch (kind) {
    case 'gate': {
      const gate = gateChallenge(rand, level);
      return {
        kind,
        title: 'A GATE HAS OPENED.',
        body: `Emergency quest: ${gate.label}. Clear it for +${GATE_CLEAR_XP} XP — it closes at midnight.`,
        xpReward: GATE_CLEAR_XP,
        payload: gate as unknown as Record<string, unknown>,
      };
    }
    case 'mana_surge':
      return {
        kind,
        title: 'MANA SURGE.',
        body: 'The ambient mana is dense today. Side quests cost no mana until midnight — spend the day freely.',
        xpReward: 0,
        payload: {},
      };
    case 'xp_surge':
      return {
        kind,
        title: 'XP SURGE.',
        body: 'The System amplifies today’s training. Daily Training Quest XP +50% until midnight.',
        xpReward: 0,
        payload: {},
      };
    case 'potion_gift':
      return {
        kind,
        title: 'A GIFT FROM THE SYSTEM.',
        body: 'A Mana Potion has materialized in your inventory. Even the System acknowledges consistency.',
        xpReward: 0,
        payload: {},
      };
  }
}

/** Training XP after the day's event (xp_surge amplifies). */
export function trainingXpWithEvent(base: number, eventKind: SystemEventKind | null): number {
  return eventKind === 'xp_surge' ? Math.round(base * XP_SURGE_MULT) : base;
}

/** Side-quest mana cost after the day's event (mana_surge waives). */
export function sideQuestCostWithEvent(cost: number, eventKind: SystemEventKind | null): number {
  return eventKind === 'mana_surge' ? 0 : cost;
}
