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
import { RANKS, STAT_GROUPS, type Rank, type StatKey } from './constants.ts';

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

// ── Titles (achievements) ─────────────────────────────────────────────────────
// Earned by crossing a milestone on one tracked metric. Each pays a one-time
// Essence reward. A Player equips one earned title to display on their Status.

/** The numeric snapshot evaluateTitles measures against. */
export type TitleState = {
  level: number;
  rankIndex: number; // index into RANKS (E=0 … Monarch=7)
  bestStreak: number;
  daysCompleted: number;
  totalReps: number; // push-ups + sit-ups + squats, lifetime
  totalRunKm: number;
  booksFinished: number;
  questionsMastered: number;
  dungeonCycles: number;
  perfectClears: number;
  riddlesSolved: number;
};

export type TitleMetric = keyof TitleState;

export type TitleDef = {
  key: string;
  name: string;
  description: string;
  metric: TitleMetric;
  threshold: number;
  essence: number;
};

export const TITLES: TitleDef[] = [
  // First steps
  { key: 'awakened', name: 'The Awakened', description: 'Complete your first Daily Training Quest', metric: 'daysCompleted', threshold: 1, essence: 20 },
  { key: 'reader', name: 'Reader', description: 'Finish your first tome', metric: 'booksFinished', threshold: 1, essence: 20 },
  { key: 'dungeon_breaker', name: 'Dungeon Breaker', description: 'Clear your first dungeon', metric: 'dungeonCycles', threshold: 1, essence: 30 },
  // Consistency
  { key: 'consistent', name: 'The Consistent', description: 'Reach a 7-day streak', metric: 'bestStreak', threshold: 7, essence: 30 },
  { key: 'relentless', name: 'The Relentless', description: 'Reach a 30-day streak', metric: 'bestStreak', threshold: 30, essence: 75 },
  { key: 'unbroken', name: 'The Unbroken', description: 'Reach a 100-day streak', metric: 'bestStreak', threshold: 100, essence: 200 },
  // Volume
  { key: 'disciplined', name: 'The Disciplined', description: 'Complete 50 training days', metric: 'daysCompleted', threshold: 50, essence: 75 },
  { key: 'veteran', name: 'Veteran', description: 'Complete 200 training days', metric: 'daysCompleted', threshold: 200, essence: 200 },
  { key: 'iron_forged', name: 'Iron-Forged', description: 'Log 10,000 lifetime reps', metric: 'totalReps', threshold: 10000, essence: 100 },
  { key: 'pathfinder', name: 'Pathfinder', description: 'Run 100 km in total', metric: 'totalRunKm', threshold: 100, essence: 100 },
  // Mind
  { key: 'scholar', name: 'Scholar', description: 'Finish 10 tomes', metric: 'booksFinished', threshold: 10, essence: 150 },
  { key: 'sage', name: 'Sage', description: 'Master 50 knowledge checks', metric: 'questionsMastered', threshold: 50, essence: 150 },
  { key: 'riddle_solver', name: 'Riddle-Solver', description: 'Solve 10 System riddles', metric: 'riddlesSolved', threshold: 10, essence: 75 },
  // Mastery
  { key: 'perfectionist', name: 'The Perfectionist', description: 'Achieve 10 Perfect Clears', metric: 'perfectClears', threshold: 10, essence: 100 },
  { key: 'conqueror', name: 'Conqueror', description: 'Clear 5 dungeon cycles', metric: 'dungeonCycles', threshold: 5, essence: 150 },
  { key: 'double_digits', name: 'Double Digits', description: 'Reach Level 10', metric: 'level', threshold: 10, essence: 50 },
  { key: 'ascendant', name: 'The Ascendant', description: 'Reach S-Rank', metric: 'rankIndex', threshold: 5, essence: 200 },
];

/** All title keys the Player currently qualifies for (earned or not). */
export function evaluateTitles(state: TitleState): string[] {
  return TITLES.filter((t) => state[t.metric] >= t.threshold).map((t) => t.key);
}

/** Catalog lookup by key. */
export function titleDef(key: string): TitleDef | undefined {
  return TITLES.find((t) => t.key === key);
}

// ── Classes (the job change) ──────────────────────────────────────────────────
// At C-Rank the System offers a class. The Player picks from the two classes in
// their dominant stat group (see eligibleClasses). Each class grants a passive
// XP bonus on the sources that match its discipline.

export type StatGroupName = (typeof STAT_GROUPS)[number]['name'];

export type ClassDef = {
  key: string;
  name: string;
  group: StatGroupName;
  perk: string;
  /** Sources the bonus applies to, or 'all' for a flat generalist bonus. */
  xpBonusSources: XpSource[] | 'all';
  xpBonusMult: number;
};

/** Rank at which the job change unlocks. */
export const JOB_CHANGE_RANK: Rank = 'C';

export const CLASSES: ClassDef[] = [
  // Physical — STR · END · AGI
  { key: 'berserker', name: 'Berserker', group: 'Physical', perk: '+15% XP from gym dungeons & bosses', xpBonusSources: ['gym_session', 'boss_clear'], xpBonusMult: 1.15 },
  { key: 'vanguard', name: 'Vanguard', group: 'Physical', perk: '+15% XP from Daily Training & Perfect Clears', xpBonusSources: ['training_quest', 'perfect_clear'], xpBonusMult: 1.15 },
  // Mental — INT · WIS · STA
  { key: 'mage', name: 'Mage', group: 'Mental', perk: '+15% XP from reading & finishing tomes', xpBonusSources: ['reading_session', 'book_finished'], xpBonusMult: 1.15 },
  { key: 'sage', name: 'Sage', group: 'Mental', perk: '+15% XP from knowledge checks, riddles & applied insight', xpBonusSources: ['knowledge_check', 'riddle_solved', 'book_applied'], xpBonusMult: 1.15 },
  // Character — WIL · DIS · CHA
  { key: 'commander', name: 'Commander', group: 'Character', perk: '+15% XP from side quests & gates', xpBonusSources: ['daily_quest', 'gate_clear'], xpBonusMult: 1.15 },
  { key: 'warden', name: 'Warden', group: 'Character', perk: '+8% XP from every source', xpBonusSources: 'all', xpBonusMult: 1.08 },
];

/** Catalog lookup by key. */
export function classDef(key: string | null | undefined): ClassDef | undefined {
  if (!key) return undefined;
  return CLASSES.find((c) => c.key === key);
}

/**
 * Classes the Player may choose, drawn from their single strongest stat group.
 * Ties resolve to the earlier group in STAT_GROUPS order (Physical→Mental→Character).
 */
export function eligibleClasses(stats: Partial<Record<StatKey, number>>): ClassDef[] {
  let best: StatGroupName = STAT_GROUPS[0].name;
  let bestSum = -Infinity;
  for (const group of STAT_GROUPS) {
    const sum = group.stats.reduce((acc, s) => acc + (Number(stats[s]) || 0), 0);
    if (sum > bestSum) {
      bestSum = sum;
      best = group.name;
    }
  }
  return CLASSES.filter((c) => c.group === best);
}

/** XP multiplier a class confers on a given source (1 if none / not matched). */
export function classXpMultiplier(classKey: string | null | undefined, source: string): number {
  const def = classDef(classKey);
  if (!def) return 1;
  if (def.xpBonusSources === 'all') return def.xpBonusMult;
  return (def.xpBonusSources as string[]).includes(source) ? def.xpBonusMult : 1;
}

// ── Skills (Essence-purchased passives + active abilities) ─────────────────────
// Passives fold continuously into the XP/stat/mana math (the server passes the
// set of unlocked keys). Actives have an immediate effect, a mana cost, and a
// cooldown measured in local days.

export type SkillType = 'passive' | 'active';
export type ActiveEffect = 'restore_mana' | 'purge_fatigue' | 'craft_potion';

/** Library sources a Scholar's Insight passive amplifies. */
const LIBRARY_SOURCES: XpSource[] = [
  'reading_session',
  'book_finished',
  'book_applied',
  'knowledge_check',
];

export type SkillDef = {
  key: string;
  name: string;
  description: string;
  type: SkillType;
  essenceCost: number;
  reqLevel: number;
  reqRank?: Rank;
  // passive effect knobs (read by the modifier helpers below):
  xpSources?: XpSource[] | 'all';
  xpMult?: number;
  statMult?: number;
  manaRegenBonus?: number;
  streakShield?: boolean;
  // active effect knobs:
  cooldownDays?: number;
  manaCost?: number;
  effect?: ActiveEffect;
};

export const SKILLS: SkillDef[] = [
  // Passives
  { key: 'scholars_insight', name: "Scholar's Insight", description: '+10% XP from all Library activity', type: 'passive', essenceCost: 100, reqLevel: 5, xpSources: LIBRARY_SOURCES, xpMult: 1.1 },
  { key: 'mana_spring', name: 'Mana Spring', description: '+15 daily mana regeneration', type: 'passive', essenceCost: 100, reqLevel: 5, manaRegenBonus: 15 },
  { key: 'iron_discipline', name: 'Iron Discipline', description: '+15% attribute gains from all effort', type: 'passive', essenceCost: 150, reqLevel: 8, statMult: 1.15 },
  { key: 'steel_will', name: 'Steel Will', description: 'Your streak survives a single missed day', type: 'passive', essenceCost: 200, reqLevel: 8, reqRank: 'C', streakShield: true },
  // Actives
  { key: 'second_wind', name: 'Second Wind', description: 'Instantly restore mana to full', type: 'active', essenceCost: 120, reqLevel: 4, cooldownDays: 3, manaCost: 0, effect: 'restore_mana' },
  { key: 'meditate', name: 'Meditate', description: 'Purge all accumulated fatigue', type: 'active', essenceCost: 80, reqLevel: 4, cooldownDays: 2, manaCost: 0, effect: 'purge_fatigue' },
  { key: 'transmute', name: 'Transmute', description: 'Spend 40 mana to craft a Mana Potion', type: 'active', essenceCost: 150, reqLevel: 6, cooldownDays: 1, manaCost: 40, effect: 'craft_potion' },
];

/** Catalog lookup by key. */
export function skillDef(key: string): SkillDef | undefined {
  return SKILLS.find((s) => s.key === key);
}

/** Context for prerequisite checks (essence/ownership handled by the caller). */
export type SkillReqContext = { level: number; rankIndex: number };

/** Reason a skill is prerequisite-locked, or null if the prereqs are met. */
export function skillPrereqError(def: SkillDef, ctx: SkillReqContext): string | null {
  if (ctx.level < def.reqLevel) return `Requires Level ${def.reqLevel}`;
  if (def.reqRank && ctx.rankIndex < RANKS.indexOf(def.reqRank)) {
    return `Requires ${def.reqRank}-Rank`;
  }
  return null;
}

const ONE_DAY_MS = 86_400_000;

/** Whole days between two YYYY-MM-DD dates (later − earlier). */
function daysBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(later) - Date.parse(earlier)) / ONE_DAY_MS);
}

/** Days left on an active skill's cooldown (0 = ready). */
export function skillCooldownRemaining(
  lastUsed: string | null,
  cooldownDays: number,
  today: string,
): number {
  if (!lastUsed) return 0;
  return Math.max(0, cooldownDays - daysBetween(lastUsed.slice(0, 10), today));
}

// ── Passive modifier helpers (server passes unlocked skill keys) ──────────────
function passives(keys: string[]): SkillDef[] {
  return keys.map(skillDef).filter((d): d is SkillDef => !!d && d.type === 'passive');
}

/** Combined passive XP multiplier for a source. */
export function skillXpMultiplier(keys: string[], source: string): number {
  let mult = 1;
  for (const d of passives(keys)) {
    if (d.xpMult == null) continue;
    if (d.xpSources === 'all' || (d.xpSources as string[] | undefined)?.includes(source)) {
      mult *= d.xpMult;
    }
  }
  return mult;
}

/** Combined passive attribute-gain multiplier. */
export function skillStatMultiplier(keys: string[]): number {
  let mult = 1;
  for (const d of passives(keys)) if (d.statMult != null) mult *= d.statMult;
  return mult;
}

/** Extra daily mana regeneration from passives. */
export function skillManaRegenBonus(keys: string[]): number {
  let bonus = 0;
  for (const d of passives(keys)) bonus += d.manaRegenBonus ?? 0;
  return bonus;
}

/** Whether any unlocked passive grants a one-day streak shield. */
export function hasStreakShield(keys: string[]): boolean {
  return passives(keys).some((d) => d.streakShield);
}
