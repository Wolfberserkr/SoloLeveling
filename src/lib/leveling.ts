import { getDb } from './db';

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
  // Smooth exponential-ish curve. Beginner-friendly early levels.
  return Math.floor(80 * Math.pow(level, 1.35));
}

export function getStats(userId: number): HunterStats {
  const db = getDb();
  const row = db.prepare('SELECT * FROM hunter_stats WHERE user_id = ?').get(userId) as any;
  return {
    level: row.level,
    xp: row.xp,
    xp_to_next: xpToNext(row.level),
    rank: row.rank,
    str: row.str,
    agi: row.agi,
    vit: row.vit,
    int_: row.int_,
    per: row.per,
    stat_points: row.stat_points,
    streak: row.streak,
    shadows_collected: row.shadows_collected,
    mana: row.mana,
    last_quest_date: row.last_quest_date,
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

export function awardXp(userId: number, xp: number, reason: string): LevelUpResult {
  const db = getDb();
  const stats = getStats(userId);
  let { level, xp: curXp } = stats;
  const oldLevel = level;
  const oldRank = stats.rank;
  let newXp = curXp + xp;
  let pointsGained = 0;
  while (newXp >= xpToNext(level)) {
    newXp -= xpToNext(level);
    level += 1;
    pointsGained += 5; // 5 free stat points per level
  }
  const newRank = rankForLevel(level);
  db.prepare(
    'UPDATE hunter_stats SET level = ?, xp = ?, rank = ?, stat_points = stat_points + ? WHERE user_id = ?'
  ).run(level, newXp, newRank, pointsGained, userId);

  if (level > oldLevel) {
    db.prepare(
      'INSERT INTO notifications (user_id, kind, title, body, created_at) VALUES (?,?,?,?,?)'
    ).run(
      userId,
      'level_up',
      `[ LEVEL UP ]  Lv.${oldLevel} → Lv.${level}`,
      `${reason}. You gained ${pointsGained} stat points to allocate.`,
      Date.now()
    );
  }
  if (newRank !== oldRank) {
    db.prepare(
      'INSERT INTO notifications (user_id, kind, title, body, created_at) VALUES (?,?,?,?,?)'
    ).run(
      userId,
      'rank_up',
      `[ RANK UP ]  ${oldRank} → ${newRank}`,
      `The System has re-evaluated you as a Rank ${newRank} Hunter.`,
      Date.now()
    );
  }
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

export function allocateStat(
  userId: number,
  stat: 'str' | 'agi' | 'vit' | 'int_' | 'per',
  amount: number
) {
  if (amount <= 0) throw new Error('Amount must be positive.');
  const db = getDb();
  const cur = getStats(userId);
  if (cur.stat_points < amount) throw new Error('Not enough stat points.');
  db.prepare(
    `UPDATE hunter_stats SET ${stat} = ${stat} + ?, stat_points = stat_points - ? WHERE user_id = ?`
  ).run(amount, amount, userId);
}

export function bumpStreak(userId: number, today: string) {
  const db = getDb();
  const stats = getStats(userId);
  const last = stats.last_quest_date;
  let newStreak = 1;
  if (last) {
    const lastDate = new Date(last + 'T00:00:00');
    const todayDate = new Date(today + 'T00:00:00');
    const diff = Math.round((todayDate.getTime() - lastDate.getTime()) / 86400000);
    if (diff === 0) return stats.streak; // already counted
    if (diff === 1) newStreak = stats.streak + 1;
  }
  db.prepare('UPDATE hunter_stats SET streak = ?, last_quest_date = ? WHERE user_id = ?').run(
    newStreak,
    today,
    userId
  );
  return newStreak;
}

export function applyDailyPenalty(userId: number) {
  // The classic "penalty for failing the daily quest." Costs HP/mana and one stat point each.
  const db = getDb();
  const stats = getStats(userId);
  db.prepare(
    'UPDATE hunter_stats SET mana = MAX(0, mana - 20), streak = 0, str = MAX(1, str - 1), vit = MAX(1, vit - 1) WHERE user_id = ?'
  ).run(userId);
  db.prepare(
    'INSERT INTO notifications (user_id, kind, title, body, created_at) VALUES (?,?,?,?,?)'
  ).run(
    userId,
    'penalty',
    `[ PENALTY QUEST FAILED ]`,
    `You did not complete the daily quest. STR -1, VIT -1, streak reset.`,
    Date.now()
  );
  return stats;
}
