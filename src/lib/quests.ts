import { getAdminSupabase } from './supabase/admin';
import { awardXp, bumpStreak } from './leveling';
import { checkAchievements } from './achievements';
import { progressActiveGate } from './gates';

export type Quest = {
  id: number;
  key: string;
  label: string;
  target: number;
  progress: number;
  unit: string | null;
  completed: boolean;
};

export function defaultDailyTemplate(level: number) {
  const scale = 1 + Math.floor((level - 1) / 5) * 0.1;
  const s = (n: number) => Math.round(n * scale);
  // Run scales independently: 2 km at level 1, +1 km every 2 levels, capped at 10 km.
  // Beginner-friendly ramp — reaches 10 km at level 17.
  const runKm = Math.min(10, 2 + Math.floor((level - 1) / 2));
  return [
    { key: 'pushups', label: 'PUSH-UPS', target: s(100), unit: 'reps' },
    { key: 'situps', label: 'SIT-UPS', target: s(100), unit: 'reps' },
    { key: 'squats', label: 'SQUATS', target: s(100), unit: 'reps' },
    { key: 'run', label: 'RUN', target: runKm, unit: 'km' },
  ];
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function rowToQuest(r: any): Quest {
  return {
    id: r.id,
    key: r.quest_key,
    label: r.label,
    target: r.target,
    progress: r.progress,
    unit: r.unit,
    completed: !!r.completed,
  };
}

export async function ensureDailyQuests(userId: string, level: number): Promise<Quest[]> {
  const sb = getAdminSupabase();
  const date = todayISO();
  const { data: existing } = await sb
    .from('daily_quests')
    .select('*')
    .eq('user_id', userId)
    .eq('quest_date', date);
  if (existing && existing.length > 0) return existing.map(rowToQuest);

  const tmpl = defaultDailyTemplate(level);
  await sb.from('daily_quests').insert(
    tmpl.map((q) => ({
      user_id: userId,
      quest_date: date,
      quest_key: q.key,
      label: q.label,
      target: q.target,
      unit: q.unit,
    }))
  );
  const { data } = await sb
    .from('daily_quests')
    .select('*')
    .eq('user_id', userId)
    .eq('quest_date', date);
  return (data || []).map(rowToQuest);
}

export type QuestProgressResult = {
  quest: Quest;
  allComplete: boolean;
  xpGained: number;
  rewards: string[];
};

export async function logQuestProgress(
  userId: string,
  questKey: string,
  amount: number
): Promise<QuestProgressResult> {
  const sb = getAdminSupabase();
  const date = todayISO();
  const { data: row } = await sb
    .from('daily_quests')
    .select('*')
    .eq('user_id', userId)
    .eq('quest_date', date)
    .eq('quest_key', questKey)
    .single();
  if (!row) throw new Error('Quest not found for today.');
  if (row.completed) {
    return { quest: rowToQuest(row), allComplete: false, xpGained: 0, rewards: [] };
  }

  const newProgress = Math.min(row.target, row.progress + amount);
  const completed = newProgress >= row.target;
  await sb
    .from('daily_quests')
    .update({ progress: newProgress, completed })
    .eq('id', row.id);

  const rewards: string[] = [];
  let xpGained = 0;
  if (completed) {
    xpGained = 30;
    await awardXp(userId, xpGained, `Completed quest: ${row.label}`);
    rewards.push(`+${xpGained} XP`);
  }

  const { count: remaining } = await sb
    .from('daily_quests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('quest_date', date)
    .eq('completed', false);
  const allComplete = (remaining || 0) === 0;

  if (allComplete) {
    const streak = await bumpStreak(userId, date);
    const streakBonus = Math.min(100, streak * 5);
    const dailyBonus = 120 + streakBonus;
    await awardXp(userId, dailyBonus, `All daily quests cleared (streak ${streak})`);
    xpGained += dailyBonus;
    rewards.push(`+${dailyBonus} XP (daily clear, streak ${streak})`);

    // Upsert Essence Stone reward.
    const { data: existing } = await sb
      .from('power_ups')
      .select('quantity')
      .eq('user_id', userId)
      .eq('power_up_key', 'essence_stone')
      .maybeSingle();
    await sb.from('power_ups').upsert(
      {
        user_id: userId,
        power_up_key: 'essence_stone',
        quantity: (existing?.quantity || 0) + 1,
      },
      { onConflict: 'user_id,power_up_key' }
    );
    rewards.push('+1 Essence Stone');

    await sb.from('notifications').insert({
      user_id: userId,
      kind: 'daily_clear',
      title: '[ DAILY QUEST CLEARED ]',
      body: `All targets met. Streak: ${streak} day(s). Rewards delivered.`,
    });
  }

  await checkAchievements(userId);

  // Mirror the increment into any active Gate whose `mirrors` matches this quest_key.
  const gateResult = await progressActiveGate(userId, questKey, amount);
  if (gateResult.cleared) {
    rewards.push(`Gate cleared: ${gateResult.gate?.label || 'Unknown Gate'}`);
  }

  const { data: updated } = await sb
    .from('daily_quests')
    .select('*')
    .eq('id', row.id)
    .single();
  return { quest: rowToQuest(updated), allComplete, xpGained, rewards };
}
