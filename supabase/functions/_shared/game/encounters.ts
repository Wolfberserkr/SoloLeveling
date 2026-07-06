// ─────────────────────────────────────────────────────────────────────────────
// RANDOM ENCOUNTERS — on-demand, DND-style monster scenarios.
//
// Spend mana to "Explore"; a scenario rolls from a hand-authored bank, scaled
// by level/rank. Each scenario offers 3-4 actions, each a STAT CHECK (one of the
// nine attributes vs a difficulty). A win pays small essence + modest XP + a
// rarity-rolled item, and rarely extracts a Shadow; a loss pays consolation XP.
//
// All rolls take an RNG function so they are pure and deterministic given a seed
// (the seed is stored per encounter row — see explore-encounter). Mirrors the
// events.ts / riddles.ts pattern. No Deno/Node/DOM.
// ─────────────────────────────────────────────────────────────────────────────
import { hashString, pickWeighted } from './rng.ts';
import { RANKS, type Rank, type StatKey } from './constants.ts';
import { DROPPABLE_CONSUMABLE_KEYS, DROPPABLE_GEAR_KEYS, ITEMS, RARITY_WEIGHT } from './items.ts';

export const EXPLORE_MANA_COST = 10;
export const EXPLORES_PER_DAY = 3;

export type ScenarioChoice = {
  key: string;
  label: string;
  stat: StatKey;
  baseDifficulty: number;
};

export type EncounterScenario = {
  key: string;
  title: string;
  body: string;
  minRankIndex?: number;
  choices: ScenarioChoice[];
};

/** Hand-authored bank. Choices across the bank exercise all nine attributes. */
export const ENCOUNTER_SCENARIOS: EncounterScenario[] = [
  {
    key: 'goblin_ambush',
    title: 'Goblin Ambush',
    body: 'A pack of goblins springs from the underbrush, blades drawn across the trail.',
    choices: [
      { key: 'charge', label: 'Charge straight through', stat: 'STR', baseDifficulty: 12 },
      { key: 'dodge', label: 'Slip past in the chaos', stat: 'AGI', baseDifficulty: 12 },
      { key: 'intimidate', label: 'Roar them into fleeing', stat: 'CHA', baseDifficulty: 14 },
      { key: 'read_terrain', label: 'Spot a hidden path', stat: 'WIS', baseDifficulty: 13 },
    ],
  },
  {
    key: 'collapsed_bridge',
    title: 'The Swaying Bridge',
    body: 'A frayed rope bridge groans over a black chasm. The far side holds your prize.',
    choices: [
      { key: 'sprint', label: 'Sprint across before it gives', stat: 'AGI', baseDifficulty: 13 },
      { key: 'steady', label: 'Cross slow and deliberate', stat: 'DIS', baseDifficulty: 12 },
      { key: 'haul', label: 'Haul the ropes taut and climb', stat: 'STR', baseDifficulty: 14 },
    ],
  },
  {
    key: 'stone_sphinx',
    title: 'The Stone Sphinx',
    body: 'A sphinx of black granite bars the way and demands you prove your mind.',
    choices: [
      { key: 'logic', label: 'Reason through the puzzle', stat: 'INT', baseDifficulty: 14 },
      { key: 'lore', label: 'Recall the old lore', stat: 'WIS', baseDifficulty: 13 },
      { key: 'endure', label: 'Outstare its hollow gaze', stat: 'WIL', baseDifficulty: 15 },
    ],
  },
  {
    key: 'starving_wolves',
    title: 'Winter Wolves',
    body: 'Gaunt wolves circle through the snow, breath steaming, patient and hungry.',
    choices: [
      { key: 'hold', label: 'Hold your ground, unflinching', stat: 'WIL', baseDifficulty: 13 },
      { key: 'outlast', label: 'Outlast them in the cold', stat: 'STA', baseDifficulty: 14 },
      { key: 'outrun', label: 'Break for the treeline', stat: 'AGI', baseDifficulty: 15 },
    ],
  },
  {
    key: 'merchant_ambush',
    title: 'The Ambushed Caravan',
    body: "A merchant's caravan is set upon by bandits. He begs you for aid.",
    choices: [
      { key: 'fight', label: 'Cut down the bandits', stat: 'STR', baseDifficulty: 14 },
      { key: 'negotiate', label: 'Talk the bandits down', stat: 'CHA', baseDifficulty: 13 },
      { key: 'flank', label: 'Flank them unseen', stat: 'AGI', baseDifficulty: 13 },
    ],
  },
  {
    key: 'cursed_altar',
    title: 'The Cursed Altar',
    body: 'An altar pulses with dark mana, whispering promises of borrowed power.',
    choices: [
      { key: 'resist', label: 'Resist the temptation', stat: 'WIL', baseDifficulty: 15 },
      { key: 'study', label: 'Decode the carved runes', stat: 'INT', baseDifficulty: 13 },
      { key: 'purify', label: 'Cleanse it with old rites', stat: 'WIS', baseDifficulty: 14 },
    ],
  },
  {
    key: 'mire_of_doubt',
    title: 'The Sucking Mire',
    body: 'A bog drags at every step, the air thick and sapping.',
    choices: [
      { key: 'push', label: 'Push through by force', stat: 'END', baseDifficulty: 14 },
      { key: 'pace', label: 'Pace yourself carefully', stat: 'DIS', baseDifficulty: 13 },
      { key: 'path', label: 'Find the firm ground', stat: 'WIS', baseDifficulty: 12 },
    ],
  },
  {
    key: 'arena_challenger',
    title: 'The Masked Challenger',
    body: 'A masked fighter steps into the ring and calls you out before the crowd.',
    choices: [
      { key: 'overpower', label: 'Overpower them', stat: 'STR', baseDifficulty: 15 },
      { key: 'outmaneuver', label: 'Outmaneuver them', stat: 'AGI', baseDifficulty: 14 },
      { key: 'unnerve', label: 'Break their nerve', stat: 'CHA', baseDifficulty: 14 },
    ],
  },
  {
    key: 'ancient_vault',
    title: 'The Sealed Vault',
    body: 'A vault door ticks with ancient mechanisms. Something valuable waits within.',
    minRankIndex: 2,
    choices: [
      { key: 'decipher', label: 'Decipher the mechanism', stat: 'INT', baseDifficulty: 15 },
      { key: 'force', label: 'Force the door open', stat: 'STR', baseDifficulty: 17 },
      { key: 'patience', label: 'Work each tumbler patiently', stat: 'DIS', baseDifficulty: 14 },
    ],
  },
  {
    key: 'plague_village',
    title: 'The Fevered Village',
    body: 'A village lies wracked with fever. The healers are overwhelmed.',
    choices: [
      { key: 'tend', label: 'Tend the sick', stat: 'WIS', baseDifficulty: 13 },
      { key: 'ration', label: 'Ration the supplies', stat: 'DIS', baseDifficulty: 13 },
      { key: 'expose', label: 'Brave the contagion', stat: 'END', baseDifficulty: 14 },
    ],
  },
  {
    key: 'shadow_duelist',
    title: 'The Mirror Shadow',
    body: 'A shadow peels from the wall and mirrors your every move, blade for blade.',
    minRankIndex: 2,
    choices: [
      { key: 'outthink', label: 'Outthink the mimicry', stat: 'INT', baseDifficulty: 15 },
      { key: 'outlast', label: 'Outlast its borrowed strength', stat: 'STA', baseDifficulty: 16 },
      { key: 'will', label: 'Shatter it with sheer will', stat: 'WIL', baseDifficulty: 15 },
    ],
  },
  {
    key: 'siren_song',
    title: 'The Luring Song',
    body: 'A haunting song drifts from the rocks, pulling your feet off the safe path.',
    choices: [
      { key: 'resist', label: 'Steel yourself against it', stat: 'WIL', baseDifficulty: 14 },
      { key: 'reason', label: 'Reason through the illusion', stat: 'INT', baseDifficulty: 13 },
      { key: 'charm', label: 'Sing back and break the spell', stat: 'CHA', baseDifficulty: 14 },
    ],
  },
];

export function scenarioByKey(key: string): EncounterScenario | undefined {
  return ENCOUNTER_SCENARIOS.find((s) => s.key === key);
}

export function rankIndexOf(rank: string): number {
  return Math.max(0, RANKS.indexOf(rank as Rank));
}

/** Scenarios available at the player's rank. */
export function eligibleScenarios(rankIndex: number): EncounterScenario[] {
  return ENCOUNTER_SCENARIOS.filter((s) => (s.minRankIndex ?? 0) <= rankIndex);
}

/** Pick a scenario the player's rank allows. */
export function rollScenario(rand: () => number, rankIndex: number): EncounterScenario {
  const pool = eligibleScenarios(rankIndex);
  return pickWeighted(rand, pool, () => 1);
}

export type Scaling = {
  difficultyBonus: number;
  xpBase: number;
  essenceBase: number;
  dropBonus: number;
};

/** Monsters grow with the Player: harder checks, slightly richer loot. */
export function monsterScaling(level: number, rankIndex: number): Scaling {
  return {
    difficultyBonus: rankIndex * 4 + Math.floor(level / 5),
    xpBase: Math.min(30, 15 + rankIndex * 2),
    essenceBase: 3,
    dropBonus: rankIndex * 0.01,
  };
}

/** Logistic success probability, clamped so nothing is sure or hopeless. */
export function successChance(statValue: number, difficulty: number): number {
  const p = 1 / (1 + Math.exp(-(statValue - difficulty) / 4));
  return Math.min(0.95, Math.max(0.05, p));
}

export function rollOutcome(rand: () => number, statValue: number, difficulty: number): boolean {
  return rand() < successChance(statValue, difficulty);
}

export type LootResult = {
  xp: number;
  essence: number;
  items: Array<{ key: string; qty: number }>;
  shadow: { name: string; grade: string } | null;
};

const ENCOUNTER_SHADOW_NAMES = [
  'Slain Beast',
  'Vanquished Sentinel',
  'Broken Duelist',
  'Fallen Stalker',
];

/** Encounter shadow grade scales with rank. */
export function encounterShadowGrade(rankIndex: number): string {
  if (rankIndex >= 5) return 'Commander';
  if (rankIndex >= 4) return 'Marshal';
  if (rankIndex >= 3) return 'Elite Knight';
  if (rankIndex >= 1) return 'Knight';
  return 'Soldier';
}

/** ~5% base (rank-scaled) chance the monster can be raised as a Shadow. */
export function rareShadowDrop(
  rand: () => number,
  rankIndex: number,
): { name: string; grade: string } | null {
  const chance = 0.05 + rankIndex * 0.005;
  if (rand() >= chance) return null;
  const name = ENCOUNTER_SHADOW_NAMES[Math.floor(rand() * ENCOUNTER_SHADOW_NAMES.length)];
  return { name, grade: encounterShadowGrade(rankIndex) };
}

/** Consolation XP for a failed check. */
export function rollConsolationXp(rand: () => number): number {
  return 3 + Math.floor(rand() * 3); // 3–5
}

/** Full loot for a winning check. */
export function rollLoot(rand: () => number, scaling: Scaling, rankIndex: number): LootResult {
  const xp = scaling.xpBase;
  const essence = 1 + Math.floor(rand() * 5); // 1–5, avg 3
  const items: Array<{ key: string; qty: number }> = [];

  // ~35% a consumable, rarity-weighted (commoner items more likely).
  if (rand() < 0.35 + scaling.dropBonus) {
    const key = pickWeighted(rand, DROPPABLE_CONSUMABLE_KEYS, (k) => RARITY_WEIGHT[ITEMS[k].rarity]);
    items.push({ key, qty: 1 });
  }
  // ~10% a piece of gear.
  if (rand() < 0.1 + scaling.dropBonus) {
    const key = pickWeighted(rand, DROPPABLE_GEAR_KEYS, (k) => RARITY_WEIGHT[ITEMS[k].rarity]);
    items.push({ key, qty: 1 });
  }

  const shadow = rareShadowDrop(rand, rankIndex);
  return { xp, essence, items, shadow };
}

/** Derive the resolution RNG seed from the encounter seed and the chosen action. */
export function resolveSeed(seed: number, choiceKey: string): number {
  return (seed ^ hashString(choiceKey)) >>> 0;
}
