// ─────────────────────────────────────────────────────────────────────────────
// SHADOW ARMY (Phase 9) — Arise.
//
// Conquests can be extracted as shadows: permanent allies, each named after the
// enemy it was and graded by its strength. Collected shadows sit in reserve;
// only a limited number (army capacity, set by rank) can be DEPLOYED at once,
// and only deployed shadows' passives apply — so a loadout is a real choice.
//
// Extraction is deliberate and costed: it spends mana and rolls a grade-scaled
// chance improved by your rank. A failed Arise costs the mana but never the
// conquest — the shadow stays available to attempt again. The act happened;
// the System does not erase real effort.
//
// Pure TypeScript, shared client + server. Mirrors the skills modifier pattern
// in progression.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { RANKS, type Rank } from './constants.ts';

/** Source of a shadow — the kind of conquest it was extracted from. */
export type ShadowSource = 'boss' | 'gate' | 'book' | 'legacy';

/** Strength tiers, weakest → strongest. Scales the passive and Arise odds. */
export const SHADOW_GRADES = [
  'Soldier',
  'Knight',
  'Elite Knight',
  'Marshal',
  'Commander',
  'Monarch',
] as const;
export type ShadowGrade = (typeof SHADOW_GRADES)[number];

export const SHADOW_EXTRACT_MANA = 40; // mana spent per Arise attempt

// Mana/effort sources a "body" shadow (from a gym boss) amplifies.
const BODY_SOURCES = ['training_quest', 'perfect_clear', 'gym_session', 'boss_clear'];

/** A passive conferred by a deployed shadow. */
export type ShadowPassive =
  | { kind: 'xp'; sources: string[] | 'all'; mult: number }
  | { kind: 'stat'; mult: number }
  | { kind: 'mana_regen'; amount: number };

/** Per-grade XP / stat multiplier magnitude. */
const GRADE_MULT: Record<ShadowGrade, number> = {
  Soldier: 1.03,
  Knight: 1.05,
  'Elite Knight': 1.07,
  Marshal: 1.1,
  Commander: 1.13,
  Monarch: 1.2,
};

/** Per-grade daily mana regeneration granted by a Gate shadow. */
const GRADE_REGEN: Record<ShadowGrade, number> = {
  Soldier: 2,
  Knight: 3,
  'Elite Knight': 4,
  Marshal: 5,
  Commander: 6,
  Monarch: 8,
};

/** Base Arise odds by grade — stronger enemies resist extraction. */
const GRADE_BASE_CHANCE: Record<ShadowGrade, number> = {
  Soldier: 0.9,
  Knight: 0.7,
  'Elite Knight': 0.6,
  Marshal: 0.5,
  Commander: 0.4,
  Monarch: 0.3,
};

/** Dungeon boss phase (1–5) → the grade of the shadow it yields. */
export function bossShadowGrade(phase: number): ShadowGrade {
  const byPhase: ShadowGrade[] = ['Knight', 'Elite Knight', 'Marshal', 'Commander', 'Monarch'];
  return byPhase[Math.min(Math.max(1, phase), byPhase.length) - 1];
}

/** Gate shadow grade scales with the Player's level when the Gate fell. */
export function gateShadowGrade(level: number): ShadowGrade {
  if (level >= 30) return 'Marshal';
  if (level >= 20) return 'Elite Knight';
  if (level >= 10) return 'Knight';
  return 'Soldier';
}

/** Tome shadow grade scales with the length of the book conquered. */
export function bookShadowGrade(totalPages: number): ShadowGrade {
  if (totalPages >= 400) return 'Elite Knight';
  if (totalPages >= 200) return 'Knight';
  return 'Soldier';
}

/**
 * The passive a shadow confers, by source and grade. Variety by source:
 *   boss   → XP on body sources        gate   → daily mana regeneration
 *   book   → all attribute gains       legacy → XP on every source (generalist)
 */
export function shadowPassive(source: ShadowSource, grade: ShadowGrade): ShadowPassive {
  switch (source) {
    case 'boss':
      return { kind: 'xp', sources: BODY_SOURCES, mult: GRADE_MULT[grade] };
    case 'gate':
      return { kind: 'mana_regen', amount: GRADE_REGEN[grade] };
    case 'book':
      return { kind: 'stat', mult: GRADE_MULT[grade] };
    case 'legacy':
      return { kind: 'xp', sources: 'all', mult: GRADE_MULT[grade] };
  }
}

/** Deployable shadows at a given rank — the army grows as you rise. */
const CAPACITY_BY_RANK: Record<Rank, number> = {
  E: 1,
  D: 1,
  C: 2,
  B: 3,
  A: 4,
  S: 5,
  National: 6,
  Monarch: 8,
};

export function armyCapacity(rank: string): number {
  return CAPACITY_BY_RANK[rank as Rank] ?? 1;
}

/**
 * Chance (0–1) of a successful Arise: grade base, lifted by player rank.
 * Clamped so nothing is ever a sure thing or truly hopeless.
 */
export function extractChance(grade: ShadowGrade, rank: string): number {
  const rankIndex = Math.max(0, RANKS.indexOf(rank as Rank));
  const chance = GRADE_BASE_CHANCE[grade] + rankIndex * 0.03;
  return Math.min(0.95, Math.max(0.1, Math.round(chance * 100) / 100));
}

/** A deployed shadow, as the modifier helpers need it. */
export type DeployedShadow = { source_type: ShadowSource; grade: ShadowGrade };

/** Combined XP multiplier from all deployed shadows for one source. */
export function shadowXpMultiplier(deployed: DeployedShadow[], source: string): number {
  let mult = 1;
  for (const s of deployed) {
    const p = shadowPassive(s.source_type, s.grade);
    if (p.kind === 'xp' && (p.sources === 'all' || p.sources.includes(source))) mult *= p.mult;
  }
  return mult;
}

/** Combined attribute-gain multiplier from all deployed shadows. */
export function shadowStatMultiplier(deployed: DeployedShadow[]): number {
  let mult = 1;
  for (const s of deployed) {
    const p = shadowPassive(s.source_type, s.grade);
    if (p.kind === 'stat') mult *= p.mult;
  }
  return mult;
}

/** Extra daily mana regeneration from all deployed shadows. */
export function shadowManaRegenBonus(deployed: DeployedShadow[]): number {
  let bonus = 0;
  for (const s of deployed) {
    const p = shadowPassive(s.source_type, s.grade);
    if (p.kind === 'mana_regen') bonus += p.amount;
  }
  return bonus;
}
