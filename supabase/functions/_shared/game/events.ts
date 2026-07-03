// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM EVENTS — Phase 5. The System is not a calendar; it interrupts.
//
// Each day spawns one or two random events, rolled deterministically per
// user+date+slot (idempotent — the lazy daily reset and the cron tick can
// both ensure them without double-spawning). Slot 1 is guaranteed and lands
// in the morning; slot 2 fires half of all days and materializes in the
// afternoon, always a different kind than the first:
//   gate         a 24h bonus challenge scaled to level; clearing pays XP
//   mana_surge   side quests cost no mana until midnight
//   xp_surge     Daily Training Quest XP +50% today
//   potion_gift  a Mana Potion materializes — the System rewards persistence
//   riddle       (Phase 6) answer before midnight, RIDDLE_MAX_ATTEMPTS tries
// Passive events simply apply all day; gates and riddles resolve by hand.
// ─────────────────────────────────────────────────────────────────────────────
import { dailyRng, pickWeighted } from './rng.ts';
import { GATE_CLEAR_XP, RIDDLE_SOLVE_XP } from './constants.ts';
import { fallbackRiddle, riddleTheme, RIDDLE_MAX_ATTEMPTS, type Riddle } from './riddles.ts';

export const SYSTEM_EVENT_KINDS = ['gate', 'mana_surge', 'xp_surge', 'potion_gift', 'riddle'] as const;
export type SystemEventKind = (typeof SYSTEM_EVENT_KINDS)[number];

/** Spawn chance per daily slot: the first event is certain, the second a coin
 * flip — once or twice a day, never zero, never a flood. */
export const EVENT_SLOT_CHANCES = [1, 0.5] as const;
export const EVENT_SLOTS = EVENT_SLOT_CHANCES.length;

/** Local hour from which the second slot may materialize — a separate
 * interruption in the afternoon, not two announcements at breakfast. */
export const SECOND_EVENT_HOUR = 14;

/** Training XP multiplier while an xp_surge is active. */
export const XP_SURGE_MULT = 1.5;

const KIND_WEIGHTS: Array<{ kind: SystemEventKind; weight: number }> = [
  { kind: 'gate', weight: 35 },
  { kind: 'mana_surge', weight: 20 },
  { kind: 'xp_surge', weight: 20 },
  { kind: 'potion_gift', weight: 10 },
  { kind: 'riddle', weight: 15 },
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
  /** Riddle events only: the deterministic fallback riddle and an AI theme.
   * eventEnsure may swap in an AI-generated riddle before the insert. */
  riddle?: Riddle & { theme: string };
};

/** Event body for a riddle prompt — also the push-notification text. */
export function riddleBody(prompt: string): string {
  return `${prompt}\n\nSpeak the answer for +${RIDDLE_SOLVE_XP} XP — ${RIDDLE_MAX_ATTEMPTS} attempts, gone at midnight.`;
}

/** Today's event for a user and slot, or null. Same inputs, same roll.
 * `exclude` keeps the second event a different kind than the first — and,
 * as a side effect, at most one gate and one riddle per day, so the
 * complete-event / answer-riddle handlers stay unambiguous. */
export function rollSystemEvent(
  userId: string,
  localDate: string,
  level: number,
  slot = 1,
  exclude: readonly SystemEventKind[] = [],
): SystemEventRoll | null {
  // Slot 1 keeps the original salt so already-spawned days stay consistent.
  const rand = dailyRng(userId, localDate, slot === 1 ? 'system-event' : `system-event-s${slot}`);
  if (rand() >= (EVENT_SLOT_CHANCES[slot - 1] ?? 0)) return null;

  const pool = KIND_WEIGHTS.filter((k) => !exclude.includes(k.kind));
  if (pool.length === 0) return null;
  const kind = pickWeighted(rand, pool, (k) => k.weight).kind;
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
    case 'riddle': {
      const riddle = fallbackRiddle(rand);
      return {
        kind,
        title: 'THE SYSTEM POSES A RIDDLE.',
        body: riddleBody(riddle.prompt),
        xpReward: RIDDLE_SOLVE_XP,
        payload: { max_attempts: RIDDLE_MAX_ATTEMPTS, attempts_used: 0 },
        riddle: { ...riddle, theme: riddleTheme(rand) },
      };
    }
  }
}

/** Training XP after the day's events (an active xp_surge amplifies). */
export function trainingXpWithEvent(base: number, eventKinds: readonly (SystemEventKind | null)[]): number {
  return eventKinds.includes('xp_surge') ? Math.round(base * XP_SURGE_MULT) : base;
}

/** Side-quest mana cost after the day's events (an active mana_surge waives). */
export function sideQuestCostWithEvent(cost: number, eventKinds: readonly (SystemEventKind | null)[]): number {
  return eventKinds.includes('mana_surge') ? 0 : cost;
}
