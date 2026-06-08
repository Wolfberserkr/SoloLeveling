import { getAdminSupabase } from './supabase/admin';
import { PROGRAM } from './program';
import { getUserTz, todayInTz, yesterdayInTz, dayOfWeekInTz } from './time';
import { hasPassive, maxManaFor, BASE_MAX_MANA } from './skills';

export const MAX_MANA = BASE_MAX_MANA;
export const SHIELD_COST = 30;
export const MEDITATE_GAIN = 10;

export type HunterStats = {
  level: number;
  xp: number;
  xp_to_next: number;
  rank: string;
  str: number;
  agi: number;
  vit: number;
  int_: number;
  per: number;
  stat_points: number;
  streak: number;
  shadows_collected: number;
  mana: number;
  mana_max: number;
  last_quest_date: string | null;
};

export const RANK_THRESHOLDS: Array<[string, number]> = [
  ['E', 1],
  ['D', 10],
  ['C', 25],
  ['B', 45],
  ['A', 70],
  ['S', 100],
  ['National', 150],
];

export function rankForLevel(level: number): string {
  let rank = 'E';
  for (const [r, min] of RANK_THRESHOLDS) if (level >= min) rank = r;
  return rank;
}

export function xpToNext(level: number): number {
  return Math.floor(80 * Math.pow(level, 1.35));
}

export type HunterStatsWithSkills = HunterStats & { skill_points: number };

export async function getStats(userId: string): Promise<HunterStatsWithSkills> {
  const sb = getAdminSupabase();
  const { data, error } = await sb.from('hunter_stats').select('*').eq('user_id', userId).single();
  if (error || !data) throw new Error(error?.message || 'Stats not found');
  const manaMax = await maxManaFor(userId);
  return {
    level: data.level,
    xp: data.xp,
    xp_to_next: xpToNext(data.level),
    rank: data.rank,
    str: data.str,
    agi: data.agi,
    vit: data.vit,
    int_: data.int_,
    per: data.per,
    stat_points: data.stat_points,
    skill_points: data.skill_points || 0,
    streak: data.streak,
    shadows_collected: data.shadows_collected,
    mana: data.mana,
    mana_max: manaMax,
    last_quest_date: data.last_quest_date,
  };
}

export type LevelUpResult = {
  leveled: boolean;
  newLevel: number;
  oldLevel: number;
  newRank: string;
  rankChanged: boolean;
  statPointsGained: number;
  xpGained: number;
};

export async function awardXp(userId: string, xp: number, reason: string): Promise<LevelUpResult> {
  const sb = getAdminSupabase();
  const stats = await getStats(userId);
  let { level, xp: curXp } = stats;
  const oldLevel = level;
  const oldRank = stats.rank;
  let newXp = curXp + xp;
  let pointsGained = 0;
  let skillPointsGained = 0;
  const auraBonus = (await hasPassive(userId, 'monarchs_aura')) ? 1 : 0;
  while (newXp >= xpToNext(level)) {
    newXp -= xpToNext(level);
    level += 1;
    pointsGained += 5;
    skillPointsGained += 1 + auraBonus;
  }
  const newRank = rankForLevel(level);
  await sb
    .from('hunter_stats')
    .update({
      level,
      xp: newXp,
      rank: newRank,
      stat_points: stats.stat_points + pointsGained,
      skill_points: stats.skill_points + skillPointsGained,
    })
    .eq('user_id', userId);

  const notes: any[] = [];
  if (level > oldLevel) {
    notes.push({
      user_id: userId,
      kind: 'level_up',
      title: `[ LEVEL UP ]  Lv.${oldLevel} → Lv.${level}`,
      body: `${reason}. +${pointsGained} stat point(s), +${skillPointsGained} skill point(s).`,
    });
  }
  if (newRank !== oldRank) {
    notes.push({
      user_id: userId,
      kind: 'rank_up',
      title: `[ RANK UP ]  ${oldRank} → ${newRank}`,
      body: `The System has re-evaluated you as a Rank ${newRank} Hunter.`,
    });
  }
  if (notes.length) await sb.from('notifications').insert(notes);

  return {
    leveled: level > oldLevel,
    newLevel: level,
    oldLevel,
    newRank,
    rankChanged: newRank !== oldRank,
    statPointsGained: pointsGained,
    xpGained: xp,
  };
}

export async function allocateStat(
  userId: string,
  stat: 'str' | 'agi' | 'vit' | 'int_' | 'per',
  amount: number
) {
  if (amount <= 0) throw new Error('Amount must be positive.');
  const sb = getAdminSupabase();
  const stats = await getStats(userId);
  if (stats.stat_points < amount) throw new Error('Not enough stat points.');
  const update: any = { stat_points: stats.stat_points - amount };
  update[stat] = (stats as any)[stat] + amount;
  await sb.from('hunter_stats').update(update).eq('user_id', userId);
}

export async function bumpStreak(userId: string, today: string): Promise<number> {
  const sb = getAdminSupabase();
  const stats = await getStats(userId);
  const last = stats.last_quest_date;
  let newStreak = 1;
  if (last) {
    const lastDate = new Date(last + 'T00:00:00Z');
    const todayDate = new Date(today + 'T00:00:00Z');
    const diff = Math.round((todayDate.getTime() - lastDate.getTime()) / 86400000);
    if (diff === 0) return stats.streak;
    if (diff === 1) newStreak = stats.streak + 1;
  }
  await sb
    .from('hunter_stats')
    .update({ streak: newStreak, last_quest_date: today })
    .eq('user_id', userId);
  return newStreak;
}

// Lazy daily-cron run on page load. Idempotent — each step fires at most
// once per day per user (in the user's timezone). Order: penalty/shield →
// meditation → gate spawn.
export async function processDailyEvents(userId: string) {
  const tz = await getUserTz(userId);
  await processDailyPenaltyIfNeeded(userId, tz);
  await processMeditationIfNeeded(userId, tz);
  // Lazy import to avoid circular dep (gates.ts imports awardXp from here).
  const { maybeSpawnGate } = await import('./gates');
  await maybeSpawnGate(userId, tz);
}

async function processDailyPenaltyIfNeeded(userId: string, tz: string) {
  const sb = getAdminSupabase();
  const today = todayInTz(tz);
  const yesterday = yesterdayInTz(tz);

  const { data: stats } = await sb
    .from('hunter_stats')
    .select('mana, str, vit, last_penalty_check')
    .eq('user_id', userId)
    .single();
  if (!stats || stats.last_penalty_check === today) return;

  const { data: yQuests } = await sb
    .from('daily_quests')
    .select('completed')
    .eq('user_id', userId)
    .eq('quest_date', yesterday)
    .not('quest_key', 'ilike', 'weekly_%');

  // Grace period: if no quests were generated yesterday (user never visited), no penalty.
  if (!yQuests || yQuests.length === 0) {
    await sb.from('hunter_stats').update({ last_penalty_check: today }).eq('user_id', userId);
    return;
  }

  const allCleared = yQuests.every((q: any) => q.completed);
  if (allCleared) {
    await sb.from('hunter_stats').update({ last_penalty_check: today }).eq('user_id', userId);
    return;
  }

  // Failed yesterday. Try Mana Shield first.
  if (stats.mana >= SHIELD_COST) {
    await sb
      .from('hunter_stats')
      .update({ mana: stats.mana - SHIELD_COST, last_penalty_check: today })
      .eq('user_id', userId);
    await sb.from('notifications').insert({
      user_id: userId,
      kind: 'shield',
      title: '[ MANA SHIELD ]  PENALTY ABSORBED',
      body: `Yesterday's failure consumed ${SHIELD_COST} mana. Streak preserved. STR & VIT intact.`,
    });
    return;
  }

  // No shield — full penalty.
  await sb
    .from('hunter_stats')
    .update({
      mana: Math.max(0, stats.mana - 20),
      streak: 0,
      str: Math.max(1, stats.str - 1),
      vit: Math.max(1, stats.vit - 1),
      last_penalty_check: today,
    })
    .eq('user_id', userId);
  await sb.from('notifications').insert({
    user_id: userId,
    kind: 'penalty',
    title: '[ PENALTY QUEST FAILED ]',
    body: `Yesterday's quest unfinished and mana too low to shield. STR -1, VIT -1, streak reset.`,
  });
}

async function processMeditationIfNeeded(userId: string, tz: string) {
  const today = todayInTz(tz);
  const dayIdx = dayOfWeekInTz(tz);
  const isRestDay = !PROGRAM.some((s) => s.day === dayIdx);
  if (!isRestDay) return;

  const sb = getAdminSupabase();
  const { data: stats } = await sb
    .from('hunter_stats')
    .select('mana, last_meditate_date')
    .eq('user_id', userId)
    .single();
  if (!stats || stats.last_meditate_date === today) return;

  const cap = await maxManaFor(userId);
  const newMana = Math.min(cap, stats.mana + MEDITATE_GAIN);
  await sb
    .from('hunter_stats')
    .update({ mana: newMana, last_meditate_date: today })
    .eq('user_id', userId);

  if (newMana > stats.mana) {
    await sb.from('notifications').insert({
      user_id: userId,
      kind: 'meditate',
      title: `[ MEDITATE ]  +${newMana - stats.mana} MANA`,
      body: `Rest-day regeneration. Mana ${stats.mana} → ${newMana} / ${cap}.`,
    });
  }
}
