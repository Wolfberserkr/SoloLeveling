// ─────────────────────────────────────────────────────────────────────────────
// PROGRESSION — Phase 7. Skills · Classes · Ranks · Titles.
//
// Rank is derived from level, never stored truth of its own — the server
// syncs profiles.rank and announces advancement. Stats grow as side effects
// of XP sources (small, capped increments — the Status window moves because
// the Player did). At CLASS_UNLOCK_LEVEL the Player chooses a class: +10% XP
// in its domain. Skills are passive perks unlocked by real milestones;
// titles are earned badges, one equippable on the status line.
//
// Pure TypeScript only — shared client+server, unit-tested.
// ─────────────────────────────────────────────────────────────────────────────
import { RANKS, type Rank, type StatKey } from './constants.ts';

// ── Ranks: level bands aligned with the training tiers ──────────────────────
export const RANK_ENTRY_LEVELS: Array<{ rank: Rank; entryLevel: number }> = [
  { rank: 'E', entryLevel: 1 },
  { rank: 'D', entryLevel: 4 },
  { rank: 'C', entryLevel: 8 },
  { rank: 'B', entryLevel: 13 },
  { rank: 'A', entryLevel: 19 },
  { rank: 'S', entryLevel: 26 },
  { rank: 'National', entryLevel: 41 },
  { rank: 'Monarch', entryLevel: 61 },
];

export function rankForLevel(level: number): Rank {
  let current: Rank = RANKS[0];
  for (const band of RANK_ENTRY_LEVELS) {
    if (level >= band.entryLevel) current = band.rank;
  }
  return current;
}

// ── Stats: each XP source trains attributes ──────────────────────────────────
// Increments are small on purpose: a perfect daily routine moves a stat by
// single digits per month, and the cap is the long game.
export const STAT_CAP = 100;

export const STAT_AWARDS: Record<string, Partial<Record<StatKey, number>>> = {
  training_quest: { STR: 0.2, END: 0.2, AGI: 0.1 },
  perfect_clear: { DIS: 0.3, WIL: 0.2 },
  daily_quest: { DIS: 0.15, CHA: 0.1 },
  gym_session: { STR: 0.3, END: 0.15, WIL: 0.05 },
  boss_clear: { STR: 1, WIL: 0.5, STA: 0.5 },
  reading_session: { INT: 0.25, WIS: 0.1 },
  book_applied: { WIS: 0.25, DIS: 0.15 },
  book_finished: { INT: 1, WIS: 0.5 },
  knowledge_check: { INT: 0.15, WIS: 0.1 },
  gate_clear: { WIL: 0.25, AGI: 0.15 },
  riddle_solved: { INT: 0.25, STA: 0.25 },
};

export function statAwardsFor(source: string): Partial<Record<StatKey, number>> | null {
  return STAT_AWARDS[source] ?? null;
}

// ── Classes: chosen once at CLASS_UNLOCK_LEVEL, +10% XP in the domain ────────
export const CLASS_UNLOCK_LEVEL = 10;
export const CLASS_XP_MULT = 1.1;

export type ClassDef = {
  key: string;
  name: string;
  /** The pitch shown at choice time. */
  line: string;
  /** XP sources this class amplifies. */
  sources: string[];
};

export const CLASSES: ClassDef[] = [
  {
    key: 'striker',
    name: 'Striker',
    line: 'The body is the first weapon. Daily training and perfect days pay more.',
    sources: ['training_quest', 'perfect_clear'],
  },
  {
    key: 'sentinel',
    name: 'Sentinel',
    line: 'Walls are built one stone at a time. Dungeon runs and boss clears pay more.',
    sources: ['gym_session', 'boss_clear'],
  },
  {
    key: 'sage',
    name: 'Sage',
    line: 'Knowledge compounds. Everything the Library pays, it pays you more.',
    sources: ['reading_session', 'book_applied', 'book_finished', 'knowledge_check'],
  },
  {
    key: 'shadow',
    name: 'Shadow',
    line: 'Opportunity favors the prepared. Side quests, gates, and riddles pay more.',
    sources: ['daily_quest', 'gate_clear', 'riddle_solved'],
  },
];

export function classByKey(key: string | null | undefined): ClassDef | null {
  return CLASSES.find((c) => c.key === key) ?? null;
}

// ── Milestone snapshot: one read feeds both skill and title unlocks ──────────
export type Snapshot = {
  level: number;
  bestStreak: number;
  daysCompleted: number;
  runKmTotal: number;
  gymSessions: number;
  bossClears: number;
  booksFinished: number;
  questionsMastered: number;
  riddlesSolved: number;
  gatesCleared: number;
  perfectClears: number;
};

// ── Skills: passive perks unlocked by milestones ─────────────────────────────
export type SkillDef = {
  key: string;
  name: string;
  requirement: string;
  perk: string;
  unlocked: (s: Snapshot) => boolean;
  /** XP perk: multiplier on these sources ('*' = every source). */
  xp?: { sources: string[] | '*'; mult: number };
  /** Flat bonus to the daily mana regeneration. */
  regenBonus?: number;
};

export const SKILLS: SkillDef[] = [
  {
    key: 'sprint',
    name: 'Sprint',
    requirement: 'Run or walk 50 km, total',
    perk: '+5% Daily Training Quest XP',
    unlocked: (s) => s.runKmTotal >= 50,
    xp: { sources: ['training_quest'], mult: 1.05 },
  },
  {
    key: 'iron_body',
    name: 'Iron Body',
    requirement: 'Clear 20 dungeon runs',
    perk: '+5% dungeon XP',
    unlocked: (s) => s.gymSessions >= 20,
    xp: { sources: ['gym_session'], mult: 1.05 },
  },
  {
    key: 'scholars_mind',
    name: 'Scholar’s Mind',
    requirement: 'Finish 2 tomes',
    perk: '+5% Library XP',
    unlocked: (s) => s.booksFinished >= 2,
    xp: {
      sources: ['reading_session', 'book_applied', 'book_finished', 'knowledge_check'],
      mult: 1.05,
    },
  },
  {
    key: 'meditation',
    name: 'Meditation',
    requirement: 'Hold a 14-day training streak',
    perk: '+5 mana at every daily reset',
    unlocked: (s) => s.bestStreak >= 14,
    regenBonus: 5,
  },
  {
    key: 'insight',
    name: 'Insight',
    requirement: 'Solve 3 of the System’s riddles',
    perk: '+5% riddle & knowledge-check XP',
    unlocked: (s) => s.riddlesSolved >= 3,
    xp: { sources: ['riddle_solved', 'knowledge_check'], mult: 1.05 },
  },
  {
    key: 'tenacity',
    name: 'Tenacity',
    requirement: 'Earn 5 Perfect Clears',
    perk: '+5% XP from everything',
    unlocked: (s) => s.perfectClears >= 5,
    xp: { sources: '*', mult: 1.05 },
  },
];

export function unlockedSkills(s: Snapshot): SkillDef[] {
  return SKILLS.filter((skill) => skill.unlocked(s));
}

export function skillByKey(key: string): SkillDef | null {
  return SKILLS.find((s) => s.key === key) ?? null;
}

/** Flat regen bonus from the Player's unlocked skill set. */
export function skillRegenBonus(skillKeys: string[]): number {
  return skillKeys.reduce((sum, key) => sum + (skillByKey(key)?.regenBonus ?? 0), 0);
}

/** Combined XP multiplier (class × skills) for one source. Round at the end. */
export function xpMultiplier(
  classKey: string | null | undefined,
  skillKeys: string[],
  source: string,
): number {
  let mult = 1;
  const cls = classByKey(classKey);
  if (cls && cls.sources.includes(source)) mult *= CLASS_XP_MULT;
  for (const key of skillKeys) {
    const xp = skillByKey(key)?.xp;
    if (xp && (xp.sources === '*' || xp.sources.includes(source))) mult *= xp.mult;
  }
  return mult;
}

// ── Titles: earned badges; one equippable on the status line ─────────────────
export type TitleDef = {
  key: string;
  name: string;
  requirement: string;
  earned: (s: Snapshot) => boolean;
};

export const TITLES: TitleDef[] = [
  { key: 'awakened', name: 'Awakened', requirement: 'Reach Level 5', earned: (s) => s.level >= 5 },
  {
    key: 'iron_will',
    name: 'Iron Will',
    requirement: 'Hold a 7-day training streak',
    earned: (s) => s.bestStreak >= 7,
  },
  {
    key: 'unbreakable',
    name: 'Unbreakable',
    requirement: 'Hold a 30-day training streak',
    earned: (s) => s.bestStreak >= 30,
  },
  {
    key: 'wolf_slayer',
    name: 'Wolf Slayer',
    requirement: 'Defeat your first dungeon boss',
    earned: (s) => s.bossClears >= 1,
  },
  {
    key: 'dungeon_crawler',
    name: 'Dungeon Crawler',
    requirement: 'Clear 25 dungeon runs',
    earned: (s) => s.gymSessions >= 25,
  },
  {
    key: 'seeker_of_truth',
    name: 'Seeker of Truth',
    requirement: 'Finish 3 tomes',
    earned: (s) => s.booksFinished >= 3,
  },
  {
    key: 'mastermind',
    name: 'Mastermind',
    requirement: 'Master 10 retention questions',
    earned: (s) => s.questionsMastered >= 10,
  },
  {
    key: 'riddle_breaker',
    name: 'Riddle Breaker',
    requirement: 'Solve 3 of the System’s riddles',
    earned: (s) => s.riddlesSolved >= 3,
  },
  {
    key: 'gatekeeper',
    name: 'Gatekeeper',
    requirement: 'Clear 10 Gates',
    earned: (s) => s.gatesCleared >= 10,
  },
  {
    key: 'perfectionist',
    name: 'Perfectionist',
    requirement: 'Earn 10 Perfect Clears',
    earned: (s) => s.perfectClears >= 10,
  },
  {
    key: 'one_hundred_days',
    name: 'Centurion',
    requirement: 'Complete 100 training days',
    earned: (s) => s.daysCompleted >= 100,
  },
  {
    key: 'shadow_monarch',
    name: 'Shadow Monarch',
    requirement: 'Reach Monarch rank (Level 61)',
    earned: (s) => s.level >= 61,
  },
];

export function earnedTitles(s: Snapshot): TitleDef[] {
  return TITLES.filter((t) => t.earned(s));
}

export function titleByKey(key: string): TitleDef | null {
  return TITLES.find((t) => t.key === key) ?? null;
}
