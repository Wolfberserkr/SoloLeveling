import { getDb } from './db';

export type AchievementDef = {
  key: string;
  title: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  icon: string;
};

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'awakening', title: 'The Awakening', description: 'Become an awakened Hunter (sign up).', rarity: 'common', icon: '◈' },
  { key: 'first_quest', title: 'First Step', description: 'Complete your first daily quest.', rarity: 'common', icon: '▲' },
  { key: 'first_daily_clear', title: 'Daily Cleared', description: 'Complete all four daily quests in a single day.', rarity: 'rare', icon: '✦' },
  { key: 'streak_7', title: 'Persistent Hunter', description: 'Maintain a 7-day streak.', rarity: 'rare', icon: '☼' },
  { key: 'streak_30', title: 'Iron Will', description: 'Maintain a 30-day streak.', rarity: 'epic', icon: '☀' },
  { key: 'streak_100', title: 'Monarch of Discipline', description: 'Maintain a 100-day streak.', rarity: 'legendary', icon: '✸' },
  { key: 'level_10', title: 'Rank-Up: D', description: 'Reach Level 10.', rarity: 'rare', icon: 'D' },
  { key: 'level_25', title: 'Rank-Up: C', description: 'Reach Level 25.', rarity: 'rare', icon: 'C' },
  { key: 'level_45', title: 'Rank-Up: B', description: 'Reach Level 45.', rarity: 'epic', icon: 'B' },
  { key: 'level_70', title: 'Rank-Up: A', description: 'Reach Level 70.', rarity: 'epic', icon: 'A' },
  { key: 'level_100', title: 'Rank-Up: S', description: 'Reach Level 100.', rarity: 'legendary', icon: 'S' },
  { key: 'first_workout', title: 'Enter the Dungeon', description: 'Log your first workout session.', rarity: 'common', icon: '⌑' },
  { key: 'pr_bench', title: 'Bench Breaker', description: 'Set a Bench Press personal record.', rarity: 'rare', icon: '⚒' },
  { key: 'pr_squat', title: 'Pillar of Vitality', description: 'Set a Back Squat personal record.', rarity: 'rare', icon: '⚒' },
  { key: 'pr_deadlift', title: 'Earth-Splitter', description: 'Set a Deadlift personal record.', rarity: 'rare', icon: '⚒' },
  { key: 'pr_press', title: 'Heaven-Touch', description: 'Set an Overhead Press personal record.', rarity: 'rare', icon: '⚒' },
  { key: 'volume_10k', title: 'Tonnage Hunter', description: 'Move 10,000 kg of total volume.', rarity: 'epic', icon: '⛰' },
  { key: 'sessions_50', title: 'Veteran', description: 'Complete 50 workout sessions.', rarity: 'epic', icon: '✶' },
  { key: 'shadow_first', title: 'Arise', description: 'Extract your first Shadow (clear a deload week).', rarity: 'legendary', icon: '☽' },
];

export function getDef(key: string) {
  return ACHIEVEMENTS.find((a) => a.key === key);
}

export function unlock(userId: number, key: string): boolean {
  const def = getDef(key);
  if (!def) return false;
  const db = getDb();
  const existing = db
    .prepare('SELECT 1 FROM achievements WHERE user_id = ? AND achievement_key = ?')
    .get(userId, key);
  if (existing) return false;
  db.prepare('INSERT INTO achievements (user_id, achievement_key, unlocked_at) VALUES (?,?,?)').run(
    userId,
    key,
    Date.now()
  );
  db.prepare(
    'INSERT INTO notifications (user_id, kind, title, body, created_at) VALUES (?,?,?,?,?)'
  ).run(
    userId,
    'achievement',
    `[ ACHIEVEMENT UNLOCKED ]  ${def.title}`,
    def.description,
    Date.now()
  );
  return true;
}

export function getUnlocked(userId: number): { key: string; unlocked_at: number }[] {
  const db = getDb();
  return db
    .prepare('SELECT achievement_key as key, unlocked_at FROM achievements WHERE user_id = ?')
    .all(userId) as any[];
}

// Re-runs all auto-unlocks based on current state. Cheap to call.
export function checkAchievements(userId: number) {
  const db = getDb();
  const stats = db.prepare('SELECT * FROM hunter_stats WHERE user_id = ?').get(userId) as any;
  if (stats.level >= 10) unlock(userId, 'level_10');
  if (stats.level >= 25) unlock(userId, 'level_25');
  if (stats.level >= 45) unlock(userId, 'level_45');
  if (stats.level >= 70) unlock(userId, 'level_70');
  if (stats.level >= 100) unlock(userId, 'level_100');
  if (stats.streak >= 7) unlock(userId, 'streak_7');
  if (stats.streak >= 30) unlock(userId, 'streak_30');
  if (stats.streak >= 100) unlock(userId, 'streak_100');

  const totalSessions = db
    .prepare(
      `SELECT COUNT(DISTINCT session_date) AS c FROM workout_logs WHERE user_id = ?`
    )
    .get(userId) as any;
  if (totalSessions.c >= 1) unlock(userId, 'first_workout');
  if (totalSessions.c >= 50) unlock(userId, 'sessions_50');

  const volume = db
    .prepare(
      `SELECT COALESCE(SUM(weight * reps), 0) AS v FROM workout_logs WHERE user_id = ? AND weight IS NOT NULL AND reps IS NOT NULL`
    )
    .get(userId) as any;
  if (volume.v >= 10000) unlock(userId, 'volume_10k');

  const completedQuests = db
    .prepare('SELECT COUNT(*) AS c FROM daily_quests WHERE user_id = ? AND completed = 1')
    .get(userId) as any;
  if (completedQuests.c >= 1) unlock(userId, 'first_quest');

  const fullClears = db
    .prepare(
      `SELECT quest_date, COUNT(*) total, SUM(completed) done FROM daily_quests WHERE user_id = ? GROUP BY quest_date HAVING done = total`
    )
    .all(userId) as any[];
  if (fullClears.length >= 1) unlock(userId, 'first_daily_clear');
}
