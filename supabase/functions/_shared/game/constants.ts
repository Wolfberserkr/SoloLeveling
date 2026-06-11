// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM CONSTANTS — single source of truth for client + edge functions.
// This directory must stay pure TypeScript: no Deno, Node, or DOM APIs.
// ─────────────────────────────────────────────────────────────────────────────

export const STATS = ['STR', 'END', 'AGI', 'INT', 'WIS', 'STA', 'WIL', 'DIS', 'CHA'] as const;
export type StatKey = (typeof STATS)[number];

export const STAT_LABELS: Record<StatKey, string> = {
  STR: 'Strength',
  END: 'Endurance',
  AGI: 'Agility',
  INT: 'Intellect',
  WIS: 'Wisdom',
  STA: 'Strategy',
  WIL: 'Willpower',
  DIS: 'Discipline',
  CHA: 'Charisma',
};

export const STAT_GROUPS: Array<{ name: string; stats: StatKey[] }> = [
  { name: 'Physical', stats: ['STR', 'END', 'AGI'] },
  { name: 'Mental', stats: ['INT', 'WIS', 'STA'] },
  { name: 'Character', stats: ['WIL', 'DIS', 'CHA'] },
];

export const RANKS = ['E', 'D', 'C', 'B', 'A', 'S', 'National', 'Monarch'] as const;
export type Rank = (typeof RANKS)[number];

export const RANK_TITLES: Record<Rank, string> = {
  E: 'Beginner',
  D: 'Apprentice',
  C: 'Practitioner',
  B: 'Professional',
  A: 'Elite',
  S: 'Master',
  National: 'Peak Human',
  Monarch: 'Sovereign',
};

// XP economy ─────────────────────────────────────────────────────────────────
export const XP_BASE = 425; // totalXpForLevel(L) = round(XP_BASE * (L^XP_EXP - 1))
export const XP_EXP = 1.55;
export const DAILY_XP_CAP = 300; // applies to cap-eligible (repeatable) sources only
export const MAX_LEVEL = 100;

// Training quest XP (repeatable → cap-eligible)
export const TRAINING_XP = 40;
export const PERFECT_CLEAR_XP = 25;

// Gym dungeons (Phase 3)
export const GYM_SESSION_XP = 60; // repeatable → cap-eligible
export const BOSS_CLEAR_XP = 200; // one-shot per phase → cap-exempt

// Library (Phase 4) — reading-session XP scales by pages (see library.ts)
export const REFLECTION_XP = 15; // written reflection with a session → cap-eligible
export const APPLY_XP = 25; // one applied insight per tome per day → cap-eligible
export const RETENTION_PASS_XP = 10; // honest recall on a knowledge check → cap-eligible

// Mana ───────────────────────────────────────────────────────────────────────
export const MANA_MAX_BASE = 100;

// Training quest tiers (level bands from the spec's example progression).
// Targets scale +5 reps / +0.25 km per 2 levels within a band, clamped at the
// next band's base, plus one increment per cleared dungeon cycle (uncapped).
export type TrainingTier = {
  entryLevel: number;
  reps: number; // base for push-ups / sit-ups / squats
  runKm: number;
};

export const TRAINING_TIERS: TrainingTier[] = [
  { entryLevel: 1, reps: 20, runKm: 1.0 }, // E  — 20/20/20/1km baseline
  { entryLevel: 4, reps: 30, runKm: 1.5 }, // D
  { entryLevel: 8, reps: 40, runKm: 2.0 }, // C
  { entryLevel: 13, reps: 60, runKm: 3.0 }, // B
  { entryLevel: 19, reps: 80, runKm: 4.0 }, // A
  { entryLevel: 26, reps: 100, runKm: 5.0 }, // S
];

export const TRAINING_VARIANTS = ['standard', 'endurance', 'strength', 'speed', 'recovery'] as const;
export type TrainingVariant = (typeof TRAINING_VARIANTS)[number];

// Form-over-failure: an incomplete day reduces the next day's load.
export const FAILURE_LOAD_MODIFIER = 0.85;
