import { getAdminSupabase } from './supabase/admin';
import { awardXp, bumpStreak } from './leveling';
import { checkAchievements } from './achievements';
import { progressActiveGate } from './gates';
import { getUserTz, todayInTz, dayOfWeekInTz } from './time';
import { domainMultiplier } from './skills';

export type Quest = {
  id: number;
  key: string;
  label: string;
  target: number;
  progress: number;
  unit: string | null;
  completed: boolean;
  weekly?: boolean;
};

// ─── Weekly bonus pool (Saturday) ────────────────────────────────────────────

type QuestTemplate = { key: string; label: string; unit: string; baseTarget: number };
type WeeklyTemplate = QuestTemplate & { dynamicTarget?: 'run+2' };

const WEEKLY_POOL: WeeklyTemplate[] = [
  { key: 'weekly_swim',         label: 'SWIM',             unit: 'min', baseTarget: 30 },
  { key: 'weekly_hike',         label: 'HIKE',             unit: 'km',  baseTarget: 8  },
  { key: 'weekly_long_run',     label: 'LONG RUN',         unit: 'km',  baseTarget: 0, dynamicTarget: 'run+2' },
  { key: 'weekly_sport',        label: 'SPORT SESSION',    unit: 'min', baseTarget: 60 },
  { key: 'weekly_cycling_long', label: 'LONG RIDE',        unit: 'km',  baseTarget: 30 },
  { key: 'weekly_circuit',      label: 'CIRCUIT TRAINING', unit: 'min', baseTarget: 40 },
];

// ─── Seeded weekly selection ──────────────────────────────────────────────────

function seedInt(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return h >>> 0;
}

function pickFromPool<T>(pool: T[], userId: string, date: string, slot: string): T {
  const n = seedInt(`${userId}:${date}:${slot}`);
  return pool[n % pool.length];
}

// ─── Target calculation ───────────────────────────────────────────────────────

// 20 reps at Lv1 → 100 at Lv10 (D-rank, the anime canonical), then +10% per 5 levels.
function canonicalRepTarget(level: number): number {
  if (level <= 10) return Math.round(20 + (80 / 9) * (level - 1));
  return Math.round(100 * (1 + Math.floor((level - 10) / 5) * 0.1));
}

// 2 km at Lv1 → 10 km at Lv10 (D-rank), stays at 10 km thereafter.
export function dailyRunTarget(level: number): number {
  if (level <= 10) return Math.max(1, Math.round(2 + (8 / 9) * (level - 1)));
  return 10;
}

// ─── Template builder (used by ensureDailyQuests) ────────────────────────────

export function defaultDailyTemplate(level: number) {
  const reps = canonicalRepTarget(level);
  return [
    { key: 'pushups', label: 'PUSH-UPS', target: reps,                  unit: 'reps' },
    { key: 'situps',  label: 'SIT-UPS',  target: reps,                  unit: 'reps' },
    { key: 'squats',  label: 'SQUATS',   target: reps,                  unit: 'reps' },
    { key: 'run',     label: 'RUN',      target: dailyRunTarget(level), unit: 'km'   },
  ];
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
    weekly: r.quest_key?.startsWith('weekly_'),
  };
}

// ─── Core public API ─────────────────────────────────────────────────────────

export async function ensureDailyQuests(userId: string, level: number): Promise<Quest[]> {
  const sb = getAdminSupabase();
  const tz = await getUserTz(userId);
  const date = todayInTz(tz);

  const { data: existing } = await sb
    .from('daily_quests')
    .select('*')
    .eq('user_id', userId)
    .eq('quest_date', date);

  // If we already have the 4 core quests (possibly more on Saturday), return.
  const coreExisting = (existing || []).filter((r: any) => !r.quest_key.startsWith('weekly_'));
  if (coreExisting.length >= 4) {
    return (existing || []).map(rowToQuest);
  }

  // Always the canonical four from the anime: push-ups, sit-ups, squats, run.
  const reps = canonicalRepTarget(level);
  const rows = [
    { user_id: userId, quest_date: date, quest_key: 'pushups', label: 'PUSH-UPS', target: reps,                  unit: 'reps' },
    { user_id: userId, quest_date: date, quest_key: 'situps',  label: 'SIT-UPS',  target: reps,                  unit: 'reps' },
    { user_id: userId, quest_date: date, quest_key: 'squats',  label: 'SQUATS',   target: reps,                  unit: 'reps' },
    { user_id: userId, quest_date: date, quest_key: 'run',     label: 'RUN',      target: dailyRunTarget(level), unit: 'km'   },
  ];

  await sb.from('daily_quests').insert(rows);

  // Saturday: spawn weekly bonus if none exists yet.
  if (dayOfWeekInTz(tz) === 6) {
    const weeklyExists = (existing || []).some((r: any) => r.quest_key.startsWith('weekly_'));
    if (!weeklyExists) {
      const weekly = pickFromPool(WEEKLY_POOL, userId, date, 'weekly');
      let target = weekly.baseTarget;
      if (weekly.dynamicTarget === 'run+2') target = dailyRunTarget(level) + 2;
      await sb.from('daily_quests').insert({
        user_id: userId,
        quest_date: date,
        quest_key: weekly.key,
        label: weekly.label,
        target,
        unit: weekly.unit,
      });
    }
  }

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
  const tz = await getUserTz(userId);
  const date = todayInTz(tz);
  const isWeekly = questKey.startsWith('weekly_');

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
  const domainMult = await domainMultiplier(userId);

  if (completed) {
    if (isWeekly) {
      // Weekly bonus: 300 XP + Essence Stone.
      xpGained = 300 * domainMult;
      await awardXp(userId, xpGained, `Weekly bonus cleared: ${row.label}`);
      rewards.push(`+${xpGained} XP (weekly bonus)`);
      const { data: existing } = await sb
        .from('power_ups')
        .select('quantity')
        .eq('user_id', userId)
        .eq('power_up_key', 'essence_stone')
        .maybeSingle();
      await sb.from('power_ups').upsert(
        { user_id: userId, power_up_key: 'essence_stone', quantity: (existing?.quantity || 0) + 2 },
        { onConflict: 'user_id,power_up_key' }
      );
      rewards.push('+2 Essence Stones');
      await sb.from('notifications').insert({
        user_id: userId,
        kind: 'weekly_clear',
        title: `[ WEEKLY BONUS CLEARED ]  ${row.label}`,
        body: `+${xpGained} XP and 2 Essence Stones delivered.`,
      });
    } else {
      xpGained = 30 * domainMult;
      await awardXp(userId, xpGained, `Completed quest: ${row.label}`);
      rewards.push(`+${xpGained} XP${domainMult > 1 ? ' (Domain)' : ''}`);
    }
  }

  // allComplete considers only core (non-weekly) quests for streak / daily bonus.
  const { count: remaining } = await sb
    .from('daily_quests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('quest_date', date)
    .eq('completed', false)
    .not('quest_key', 'ilike', 'weekly_%');
  const allComplete = (remaining || 0) === 0;

  if (!isWeekly && allComplete && completed) {
    const streak = await bumpStreak(userId, date);
    const streakBonus = Math.min(100, streak * 5);
    const dailyBonus = (120 + streakBonus) * domainMult;
    await awardXp(userId, dailyBonus, `All daily quests cleared (streak ${streak})`);
    xpGained += dailyBonus;
    rewards.push(`+${dailyBonus} XP (daily clear, streak ${streak})`);

    const { data: existing } = await sb
      .from('power_ups')
      .select('quantity')
      .eq('user_id', userId)
      .eq('power_up_key', 'essence_stone')
      .maybeSingle();
    await sb.from('power_ups').upsert(
      { user_id: userId, power_up_key: 'essence_stone', quantity: (existing?.quantity || 0) + 1 },
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

  // Mirror into active Gate (weekly quests don't mirror — no gate key match).
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

// Used by the Ruler's Hand skill.
export async function applyRulersHand(
  userId: string,
  questKey: string
): Promise<{ ok: boolean; message: string; label?: string }> {
  const sb = getAdminSupabase();
  const tz = await getUserTz(userId);
  const date = todayInTz(tz);
  const { data: row } = await sb
    .from('daily_quests')
    .select('*')
    .eq('user_id', userId)
    .eq('quest_date', date)
    .eq('quest_key', questKey)
    .maybeSingle();
  if (!row) return { ok: false, message: 'Quest not found for today.' };
  if (row.completed) return { ok: false, message: 'Quest already complete.' };
  // Ruler's Hand only works on core quests, not the weekly bonus.
  if (questKey.startsWith('weekly_')) return { ok: false, message: "Ruler's Hand can't be used on weekly bonus quests." };
  const remaining = row.target - row.progress;
  await logQuestProgress(userId, questKey, remaining);
  return { ok: true, message: `${row.label} cleared.`, label: row.label };
}
