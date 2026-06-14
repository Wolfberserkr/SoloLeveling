// ─────────────────────────────────────────────────────────────────────────────
// PROGRESSION (Phase 7) — Ranks · Stats · (Classes, Titles, Skills follow).
//
// Pure TypeScript, shared client + server (the @game alias). No Deno/Node/DOM.
//
// This module turns the dormant identity fields alive:
//   • rank   — promoted by level, deterministic (was hardcoded 'E')
//   • stats  — grown by what the Player actually DOES (were frozen at 10)
//
// Ranks track the Daily Training Quest tiers (see TRAINING_TIERS) so a rank-up
// lands on the same level a new training band opens.
// ─────────────────────────────────────────────────────────────────────────────
import { RANKS, type Rank, type StatKey } from './constants.ts';

/**
 * Lowest level at which each rank is held. Aligned to TRAINING_TIERS
 * (E@1, D@4, C@8, B@13, A@19, S@26) and extended past the campaign with
 * the two prestige ranks. MUST match the backfill CASE in 0011_progression.sql.
 */
export const RANK_THRESHOLDS: Record<Rank, number> = {
  E: 1,
  D: 4,
  C: 8,
  B: 13,
  A: 19,
  S: 26,
  National: 50,
  Monarch: 75,
};

/** The rank held at a given level. Highest threshold not exceeding the level. */
export function rankForLevel(level: number): Rank {
  let rank: Rank = 'E';
  for (const r of RANKS) {
    if (level >= RANK_THRESHOLDS[r]) rank = r;
  }
  return rank;
}

/** Essence Stones granted on reaching a new rank — the currency Skills spend. */
export const RANK_UP_ESSENCE = 50;

// ── Stat growth ───────────────────────────────────────────────────────────────
// Every XP-granting action also trains attributes. These are deliberately small:
// stats start at 10 and climb over months of consistent effort, mirroring the
// 1–2 year pacing. One-shot sources (boss/book clears) pay larger one-time jumps.

/** Sources that flow through award_xp — the keys passed to statGainsFor. */
export type XpSource =
  | 'training_quest'
  | 'perfect_clear'
  | 'daily_quest'
  | 'gym_session'
  | 'boss_clear'
  | 'reading_session'
  | 'book_applied'
  | 'book_finished'
  | 'knowledge_check'
  | 'gate_clear'
  | 'riddle_solved';

type StatGain = Partial<Record<StatKey, number>>;

const STAT_GAINS: Record<XpSource, StatGain> = {
  // Physical work — the Daily Training Quest is the spine of the build.
  training_quest: { STR: 0.3, END: 0.3, AGI: 0.2 },
  gym_session: { STR: 0.4, END: 0.3 },
  boss_clear: { STR: 1.0, END: 0.5, WIL: 0.5 }, // one-shot per dungeon phase
  // Doing everything the System asked in one day forges character.
  perfect_clear: { WIL: 0.4, DIS: 0.3 },
  // Side quests are the mental/character chores; journaling builds self-regard.
  daily_quest: { DIS: 0.2, CHA: 0.1 },
  // The Library — Read · Apply · Retain.
  reading_session: { INT: 0.3, WIS: 0.2 },
  book_applied: { STA: 0.3, DIS: 0.2 },
  book_finished: { INT: 1.0, WIS: 0.5 }, // one-shot per tome
  knowledge_check: { INT: 0.2, WIS: 0.2 },
  // System Events test agility under pressure and a sharp mind.
  gate_clear: { AGI: 0.4, WIL: 0.4 },
  riddle_solved: { STA: 0.4, INT: 0.3 },
};

/**
 * Attribute gains for an XP source. Returns {} for sources with no mapping so
 * callers can skip the stat write entirely. The map is read-only — callers must
 * not mutate the returned object.
 */
export function statGainsFor(source: string): StatGain {
  return STAT_GAINS[source as XpSource] ?? {};
}
