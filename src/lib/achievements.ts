import { getAdminSupabase } from './supabase/admin';

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

export async function unlock(userId: string, key: string): Promise<boolean> {
  const def = getDef(key);
  if (!def) return false;
  const sb = getAdminSupabase();
  const { data: existing } = await sb
    .from('achievements')
    .select('achievement_key')
    .eq('user_id', userId)
    .eq('achievement_key', key)
    .maybeSingle();
  if (existing) return false;
  await sb.from('achievements').insert({ user_id: userId, achievement_key: key });
  await sb.from('notifications').insert({
    user_id: userId,
    kind: 'achievement',
    title: `[ ACHIEVEMENT UNLOCKED ]  ${def.title}`,
    body: def.description,
  });
  // Auto-equip the first title the Hunter ever earns.
  const { data: profile } = await sb
    .from('profiles')
    .select('active_title')
    .eq('id', userId)
    .maybeSingle();
  if (!profile?.active_title) {
    await sb.from('profiles').update({ active_title: key }).eq('id', userId);
  }
  return true;
}

// Title lookup helper for UI. Pass an achievement_key, get { title, rarity }.
export function titleFor(key: string | null | undefined) {
  if (!key) return null;
  const def = getDef(key);
  if (!def) return null;
  return { key, title: def.title, rarity: def.rarity, icon: def.icon };
}

export async function getUnlocked(userId: string): Promise<{ key: string; unlocked_at: string }[]> {
  const sb = getAdminSupabase();
  const { data } = await sb
    .from('achievements')
    .select('achievement_key, unlocked_at')
    .eq('user_id', userId);
  return (data || []).map((r: any) => ({ key: r.achievement_key, unlocked_at: r.unlocked_at }));
}

export async function checkAchievements(userId: string) {
  const sb = getAdminSupabase();
  const { data: stats } = await sb
    .from('hunter_stats')
    .select('level, streak')
    .eq('user_id', userId)
    .single();
  if (!stats) return;

  if (stats.level >= 10) await unlock(userId, 'level_10');
  if (stats.level >= 25) await unlock(userId, 'level_25');
  if (stats.level >= 45) await unlock(userId, 'level_45');
  if (stats.level >= 70) await unlock(userId, 'level_70');
  if (stats.level >= 100) await unlock(userId, 'level_100');
  if (stats.streak >= 7) await unlock(userId, 'streak_7');
  if (stats.streak >= 30) await unlock(userId, 'streak_30');
  if (stats.streak >= 100) await unlock(userId, 'streak_100');

  const { data: sessions } = await sb
    .from('workout_logs')
    .select('session_date')
    .eq('user_id', userId);
  const sessionDates = new Set((sessions || []).map((r: any) => r.session_date));
  if (sessionDates.size >= 1) await unlock(userId, 'first_workout');
  if (sessionDates.size >= 50) await unlock(userId, 'sessions_50');

  const { data: volRows } = await sb
    .from('workout_logs')
    .select('weight, reps')
    .eq('user_id', userId)
    .not('weight', 'is', null)
    .not('reps', 'is', null);
  const volume = (volRows || []).reduce(
    (acc: number, r: any) => acc + Number(r.weight) * Number(r.reps),
    0
  );
  if (volume >= 10000) await unlock(userId, 'volume_10k');

  const { count: completedQuestsCount } = await sb
    .from('daily_quests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('completed', true);
  if ((completedQuestsCount || 0) >= 1) await unlock(userId, 'first_quest');

  const { data: dq } = await sb
    .from('daily_quests')
    .select('quest_date, completed')
    .eq('user_id', userId);
  const byDay = new Map<string, { t: number; d: number }>();
  for (const r of dq || []) {
    const cur = byDay.get(r.quest_date) || { t: 0, d: 0 };
    cur.t += 1;
    if (r.completed) cur.d += 1;
    byDay.set(r.quest_date, cur);
  }
  for (const v of byDay.values()) {
    if (v.d === v.t) {
      await unlock(userId, 'first_daily_clear');
      break;
    }
  }
}
