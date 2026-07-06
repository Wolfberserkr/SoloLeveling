// ─────────────────────────────────────────────────────────────────────────────
// THE SPARTAN PROTOCOL — a 6-month campaign, mapped onto the System (docs/
// SPARTAN_PROTOCOL.md). An OPTIONAL side mission the Player enlists in. Once
// undertaken it is binding: each chapter carries a deadline, and letting one
// lapse (or deserting) COLLAPSES the campaign — a real rank/XP toll, with a
// cooldown before re-enlisting.
//
// The four chapters reuse the existing Gym Dungeon phases and their exit bosses
// (Gatekeeper → Iron Golem → Berserker Knight → Demon of the Summit), so the
// strength benchmarks are attested through the dungeon boss the Player already
// fights. The campaign adds the derived checkpoints the plan lives or dies on:
// bodyweight, streak, protein cadence, gym cadence. Clearing all four chapters
// grants the campaign's exclusive rewards — capped by an unrepeatable Monarch
// shadow and a permanent artifact.
//
// Hardcoded to the Player's 29/06/2026 body-composition scan (single-player
// app; see ROADMAP answer #10). Pure TypeScript, shared client + server (the
// @game alias). No Deno/Node/DOM.
// ─────────────────────────────────────────────────────────────────────────────
import { RANKS, type Rank } from './constants.ts';
import { RANK_THRESHOLDS, rankForLevel } from './progression.ts';
import { totalXpForLevel, levelFromTotalXp } from './xpCurve.ts';
import { addDays } from './library.ts';

// ── Scan-derived constants (the Player's starting boss stats) ────────────────
export const SPARTAN_START_WEIGHT_KG = 116.5;
export const SPARTAN_PROTEIN_TARGET_G = 182;
/** Days a collapsed campaign must cool down before the Player may re-enlist. */
export const SPARTAN_REENLIST_COOLDOWN_DAYS = 14;

export type SpartanStatus = 'inactive' | 'active' | 'completed' | 'failed';

/** A single item payout (key references the code catalog in items.ts). */
export type SpartanItemGrant = { key: string; qty: number };

export type SpartanReward = {
  items: SpartanItemGrant[];
  /** Grant the exclusive Monarch "Spartan" shadow (final chapter only). */
  shadow?: boolean;
  /** Grant a permanent (non-expiring) artifact by item key. */
  gear?: string;
};

export type SpartanChapter = {
  index: number; // 1-based
  key: string;
  name: string;
  /** Which Gym Dungeon phase's exit boss gates this chapter. */
  dungeonPhase: number;
  bossName: string;
  /** Deadline budget, in days, from when this chapter started. */
  durationDays: number;
  /** End-of-chapter bodyweight checkpoint (kg) — the campaign's spine. */
  weightTargetKg: number;
  /** Streak that must be alive to clear the chapter. */
  minStreak: number;
  /** Protein-on-target days required within the trailing week. */
  proteinDaysPerWeek: number;
  /** Gym-session days required within the trailing week. */
  gymDaysPerWeek: number;
  reward: SpartanReward;
  blurb: string;
};

/** The exclusive artifact key granted on final completion (see items.ts). */
export const SPARTAN_GEAR_KEY = 'spartans_aegis';
/** The exclusive shadow's identity (source 'campaign', Monarch grade). */
export const SPARTAN_SHADOW_NAME = 'The Spartan';
export const SPARTAN_SHADOW_GRADE = 'Monarch' as const;

// The four chapters. Weight checkpoints and month spans follow the campaign
// table and month-by-month checkpoints in docs/SPARTAN_PROTOCOL.md.
export const SPARTAN_CHAPTERS: SpartanChapter[] = [
  {
    index: 1,
    key: 'foundation',
    name: 'Foundation',
    dungeonPhase: 1,
    bossName: 'The Gatekeeper',
    durationDays: 45,
    weightTargetKg: 111,
    minStreak: 7,
    proteinDaysPerWeek: 5,
    gymDaysPerWeek: 4,
    reward: { items: [{ key: 'mana_draught', qty: 2 }, { key: 'cleansing_water', qty: 1 }] },
    blurb: 'Learn the movements, build the habit, joint-friendly volume. The base everything stands on.',
  },
  {
    index: 2,
    key: 'iron_path',
    name: 'Iron Path',
    dungeonPhase: 2,
    bossName: 'Iron Golem',
    durationDays: 45,
    weightTargetKg: 107,
    minStreak: 12,
    proteinDaysPerWeek: 5,
    gymDaysPerWeek: 4,
    reward: { items: [{ key: 'xp_token', qty: 2 }, { key: 'essence_shard', qty: 1 }] },
    blurb: 'Barbell linear progression — add weight every session you can. The frame hardens.',
  },
  {
    index: 3,
    key: 'warriors_forge',
    name: "Warrior's Forge",
    dungeonPhase: 3,
    bossName: 'Berserker Knight',
    durationDays: 50,
    weightTargetKg: 100,
    minStreak: 18,
    proteinDaysPerWeek: 5,
    gymDaysPerWeek: 4,
    reward: { items: [{ key: 'essence_shard', qty: 2 }, { key: 'shield_of_resolve', qty: 1 }] },
    blurb: 'Volume and engine work. Clothes two sizes down; the first strict pull-ups arrive.',
  },
  {
    index: 4,
    key: 'elite_conditioning',
    name: 'Elite Conditioning',
    dungeonPhase: 4,
    bossName: 'Demon of the Summit',
    durationDays: 55,
    weightTargetKg: 96,
    minStreak: 25,
    proteinDaysPerWeek: 5,
    gymDaysPerWeek: 4,
    reward: {
      items: [{ key: 'essence_shard', qty: 3 }, { key: 'shield_of_resolve', qty: 1 }],
      shadow: true,
      gear: SPARTAN_GEAR_KEY,
    },
    blurb: 'Heavy fives, sprints, weighted calisthenics. Visibly lean, conditioned, strong — undeniably in shape.',
  },
];

export const SPARTAN_FINAL_CHAPTER = SPARTAN_CHAPTERS.length;

export function chapterByIndex(index: number): SpartanChapter {
  const clamped = Math.min(Math.max(1, Math.trunc(index)), SPARTAN_FINAL_CHAPTER);
  return SPARTAN_CHAPTERS[clamped - 1];
}

export function isFinalChapter(index: number): boolean {
  return index >= SPARTAN_FINAL_CHAPTER;
}

// ── Deadlines ────────────────────────────────────────────────────────────────
/** The date a chapter's deadline falls, from the date that chapter started. */
export function chapterDeadline(chapterStarted: string, chapter: SpartanChapter): string {
  return addDays(chapterStarted, chapter.durationDays);
}

/** Whole days remaining until the deadline (negative once overdue). */
export function daysUntil(today: string, deadline: string): number {
  const a = new Date(`${today}T12:00:00Z`).getTime();
  const b = new Date(`${deadline}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** True once the active chapter's deadline has fully passed. */
export function isChapterOverdue(today: string, chapterStarted: string, chapter: SpartanChapter): boolean {
  return today > chapterDeadline(chapterStarted, chapter);
}

// ── Chapter condition evaluation ─────────────────────────────────────────────
/** The live inputs a chapter is judged against. Nulls mean "not yet synced". */
export type SpartanMetrics = {
  weightKg: number | null;
  streak: number;
  dungeonPhase: number;
  proteinDaysThisWeek: number | null;
  gymDaysThisWeek: number | null;
};

export type SpartanCondition = {
  key: string;
  label: string;
  /** Direction of the target: 'gte' most, 'lte' for bodyweight. */
  dir: 'gte' | 'lte';
  value: number | null;
  target: number;
  unit: string;
  met: boolean;
  /** The derived input hasn't loaded yet (client fast-path); not a failure. */
  pending: boolean;
};

function cond(
  key: string,
  label: string,
  dir: 'gte' | 'lte',
  value: number | null,
  target: number,
  unit: string,
): SpartanCondition {
  const pending = value === null;
  const met =
    value !== null && (dir === 'gte' ? value >= target : value <= target);
  return { key, label, dir, value, target, unit, met, pending };
}

export function chapterConditions(chapter: SpartanChapter, m: SpartanMetrics): SpartanCondition[] {
  return [
    cond('weight', `Bodyweight ≤ ${chapter.weightTargetKg} kg`, 'lte', m.weightKg, chapter.weightTargetKg, 'kg'),
    cond('streak', `Training streak ≥ ${chapter.minStreak} days`, 'gte', m.streak, chapter.minStreak, 'days'),
    cond('protein', `Protein on target ${chapter.proteinDaysPerWeek}+ days this week`, 'gte', m.proteinDaysThisWeek, chapter.proteinDaysPerWeek, 'days'),
    cond('gym', `Gym Dungeon cleared ${chapter.gymDaysPerWeek}+ days this week`, 'gte', m.gymDaysThisWeek, chapter.gymDaysPerWeek, 'days'),
    // The exit boss: cleared once the Player has moved PAST that dungeon phase.
    cond('boss', `Defeat ${chapter.bossName}`, 'gte', m.dungeonPhase, chapter.dungeonPhase + 1, 'phase'),
  ];
}

/** Every condition met — the chapter can be advanced. */
export function chapterCleared(conditions: SpartanCondition[]): boolean {
  return conditions.every((c) => c.met);
}

// ── Collapse penalty (desertion / missed deadline) ───────────────────────────
export type CollapseResult = {
  newLevel: number;
  newXpTotal: number;
  newRank: Rank;
  lostXp: number;
  demotedFrom: Rank;
};

/**
 * The toll for a collapsed campaign: demote one full rank (down to its floor
 * level) and forfeit the XP above it. Already at E-Rank, half of current XP is
 * burned instead. Essence loss is applied by the caller. Deterministic + pure.
 */
export function collapsePenalty(level: number, xpTotal: number): CollapseResult {
  const demotedFrom = rankForLevel(level);
  const idx = RANKS.indexOf(demotedFrom);
  if (idx <= 0) {
    // Already the lowest rank — burn half the XP rather than nothing.
    const newXpTotal = Math.floor(Math.max(0, xpTotal) / 2);
    const newLevel = levelFromTotalXp(newXpTotal);
    return { newLevel, newXpTotal, newRank: rankForLevel(newLevel), lostXp: xpTotal - newXpTotal, demotedFrom };
  }
  const lowerRank = RANKS[idx - 1];
  const newLevel = RANK_THRESHOLDS[lowerRank];
  const newXpTotal = totalXpForLevel(newLevel);
  return {
    newLevel,
    newXpTotal,
    newRank: rankForLevel(newLevel),
    lostXp: Math.max(0, xpTotal - newXpTotal),
    demotedFrom,
  };
}

// ── Snapshot (shared by server evaluation + client rendering) ────────────────
export type SpartanCampaignInput = {
  status: SpartanStatus;
  current_chapter: number;
  chapter_started_at: string | null;
  chapters_cleared: number;
  enlisted_at: string | null;
  failed_at: string | null;
  completed_at: string | null;
  reenlist_available_on: string | null;
} | null;

export type SpartanChapterView = {
  index: number;
  key: string;
  name: string;
  bossName: string;
  blurb: string;
  weightTargetKg: number;
  deadline: string;
  daysLeft: number;
  overdue: boolean;
  conditions: SpartanCondition[];
  allMet: boolean;
  reward: SpartanReward;
};

export type SpartanSnapshot = {
  status: SpartanStatus;
  currentChapter: number;
  chaptersCleared: number;
  totalChapters: number;
  enlistedAt: string | null;
  failedAt: string | null;
  completedAt: string | null;
  reenlistOn: string | null;
  canReenlist: boolean;
  chapter: SpartanChapterView | null;
};

/**
 * Build the full campaign snapshot the panel renders. The server passes
 * complete metrics; the client fast-path may pass null protein/gym cadence
 * (shown as "syncing") until the next full load.
 */
export function buildSpartanSnapshot(
  campaign: SpartanCampaignInput,
  m: SpartanMetrics,
  today: string,
): SpartanSnapshot {
  const base = {
    totalChapters: SPARTAN_FINAL_CHAPTER,
    enlistedAt: campaign?.enlisted_at ?? null,
    failedAt: campaign?.failed_at ?? null,
    completedAt: campaign?.completed_at ?? null,
    reenlistOn: campaign?.reenlist_available_on ?? null,
    canReenlist: !campaign?.reenlist_available_on || today >= campaign.reenlist_available_on,
    chaptersCleared: campaign?.chapters_cleared ?? 0,
  };

  if (!campaign || campaign.status === 'inactive') {
    return { status: 'inactive', currentChapter: 1, chapter: null, ...base };
  }

  if (campaign.status !== 'active') {
    return { status: campaign.status, currentChapter: campaign.current_chapter, chapter: null, ...base };
  }

  const chapter = chapterByIndex(campaign.current_chapter);
  const started = campaign.chapter_started_at ?? campaign.enlisted_at ?? today;
  const deadline = chapterDeadline(started, chapter);
  const conditions = chapterConditions(chapter, m);
  const view: SpartanChapterView = {
    index: chapter.index,
    key: chapter.key,
    name: chapter.name,
    bossName: chapter.bossName,
    blurb: chapter.blurb,
    weightTargetKg: chapter.weightTargetKg,
    deadline,
    daysLeft: daysUntil(today, deadline),
    overdue: today > deadline,
    conditions,
    allMet: chapterCleared(conditions),
    reward: chapter.reward,
  };
  return { status: 'active', currentChapter: campaign.current_chapter, chapter: view, ...base };
}
