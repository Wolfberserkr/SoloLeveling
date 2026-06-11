// ─────────────────────────────────────────────────────────────────────────────
// DAILY LOOP — Phase 2. Side quests and training-variant rolls, generated
// deterministically per user+date so the lazy daily reset stays idempotent.
//
// Side quests are the mind/character half of the day: they cost mana to
// complete (the economy's spend side) and pay XP. Training stays free —
// the body work IS the baseline, not a purchase.
// ─────────────────────────────────────────────────────────────────────────────
import { MANA_COSTS } from './mana.ts';
import { dailyRng, pickWeighted } from './rng.ts';
import type { TrainingVariant } from './constants.ts';

export type SideQuestDef = {
  key: keyof typeof MANA_COSTS & string;
  title: string;
  body: string;
  manaCost: number;
  xp: number;
  weight: number;
};

export const SIDE_QUEST_POOL: SideQuestDef[] = [
  {
    key: 'deep_work',
    title: 'Deep Work Block',
    body: '90 uninterrupted minutes on the work that matters most. Phone in another room.',
    manaCost: MANA_COSTS.deep_work,
    xp: 25,
    weight: 20,
  },
  {
    key: 'reading',
    title: 'Feed the Mind',
    body: 'Read 30 pages of a real book. Skimming does not count.',
    manaCost: MANA_COSTS.reading,
    xp: 20,
    weight: 20,
  },
  {
    key: 'journaling',
    title: 'Debrief',
    body: 'Journal honestly: what moved you forward today, what pulled you back.',
    manaCost: MANA_COSTS.journaling,
    xp: 15,
    weight: 20,
  },
  {
    key: 'study',
    title: 'Skill Grind',
    body: '30 focused minutes studying or practicing a skill you are building.',
    manaCost: MANA_COSTS.study,
    xp: 20,
    weight: 20,
  },
  {
    key: 'strategy',
    title: 'War Room',
    body: '20 minutes of planning: review goals, set tomorrow’s line of attack.',
    manaCost: MANA_COSTS.strategy,
    xp: 20,
    weight: 15,
  },
];

export const SIDE_QUESTS_PER_DAY = 2;

// Recovery is never rolled — it is triggered by state (low mana, poor sleep,
// accumulated fatigue), not by chance.
const VARIANT_POOL: Array<{ variant: TrainingVariant; weight: number }> = [
  { variant: 'standard', weight: 60 },
  { variant: 'endurance', weight: 15 },
  { variant: 'strength', weight: 15 },
  { variant: 'speed', weight: 10 },
];

/** Today's training variant for a user (deterministic per user+date). */
export function rollTrainingVariant(userId: string, localDate: string): TrainingVariant {
  const rand = dailyRng(userId, localDate, 'variant');
  return pickWeighted(rand, VARIANT_POOL, (v) => v.weight).variant;
}

/** Today's side quests (deterministic per user+date, no duplicate keys). */
export function rollSideQuests(
  userId: string,
  localDate: string,
  count = SIDE_QUESTS_PER_DAY,
): SideQuestDef[] {
  const rand = dailyRng(userId, localDate, 'side-quests');
  const pool = [...SIDE_QUEST_POOL];
  const picked: SideQuestDef[] = [];
  while (picked.length < count && pool.length > 0) {
    const quest = pickWeighted(rand, pool, (q) => q.weight);
    picked.push(quest);
    pool.splice(pool.indexOf(quest), 1);
  }
  return picked;
}
