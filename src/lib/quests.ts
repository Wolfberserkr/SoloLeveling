import { getDb } from './db';
import { awardXp, bumpStreak } from './leveling';
import { checkAchievements } from './achievements';

export type Quest = {
  id: number;
  key: string;
  label: string;
  target: number;
  progress: number;
  unit: string | null;
  completed: boolean;
};

// The signature Solo Leveling daily quest. We scale slightly with hunter level so
// it stays challenging — but the iconic four-task structure stays exactly the same.
export function defaultDailyTemplate(level: number) {
  const scale = 1 + Math.floor((level - 1) / 5) * 0.1; // +10% target every 5 levels
  const s = (n: number) => Math.round(n * scale);
  return [
    { key: 'pushups', label: 'PUSH-UPS', target: s(100), unit: 'reps' },
    { key: 'situps', label: 'SIT-UPS', target: s(100), unit: 'reps' },
    { key: 'squats', label: 'SQUATS', target: s(100), unit: 'reps' },
    { key: 'run', label: 'RUN', target: s(10), unit: 'km' },
  ];
}

export function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function ensureDailyQuests(userId: number, level: number): Quest[] {
  const db = getDb();
  const date = todayISO();
  const existing = db
    .prepare('SELECT * FROM daily_quests WHERE user_id = ? AND quest_date = ?')
    .all(userId, date) as any[];
  if (existing.length > 0) return existing.map(rowToQuest);
  const tmpl = defaultDailyTemplate(level);
  const insert = db.prepare(
    'INSERT INTO daily_quests (user_id, quest_date, quest_key, label, target, progress, unit) VALUES (?,?,?,?,?,0,?)'
  );
  const txn = db.transaction(() => {
    for (const q of tmpl) insert.run(userId, date, q.key, q.label, q.target, q.unit);
  });
  txn();
  return (
    db
      .prepare('SELECT * FROM daily_quests WHERE user_id = ? AND quest_date = ?')
      .all(userId, date) as any[]
  ).map(rowToQuest);
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

export type QuestProgressResult = {
  quest: Quest;
  allComplete: boolean;
  xpGained: number;
  rewards: string[];
};

export function logQuestProgress(userId: number, questKey: string, amount: number): QuestProgressResult {
  const db = getDb();
  const date = todayISO();
  const row = db
    .prepare('SELECT * FROM daily_quests WHERE user_id = ? AND quest_date = ? AND quest_key = ?')
    .get(userId, date, questKey) as any;
  if (!row) throw new Error('Quest not found for today.');
  if (row.completed) return { quest: rowToQuest(row), allComplete: false, xpGained: 0, rewards: [] };

  const newProgress = Math.min(row.target, row.progress + amount);
  const completed = newProgress >= row.target;
  db.prepare('UPDATE daily_quests SET progress = ?, completed = ? WHERE id = ?').run(
    newProgress,
    completed ? 1 : 0,
    row.id
  );

  const rewards: string[] = [];
  let xpGained = 0;
  if (completed) {
    xpGained = 30;
    awardXp(userId, xpGained, `Completed quest: ${row.label}`);
    rewards.push(`+${xpGained} XP`);
  }

  // Check if ALL daily quests are done.
  const remaining = db
    .prepare(
      'SELECT COUNT(*) AS c FROM daily_quests WHERE user_id = ? AND quest_date = ? AND completed = 0'
    )
    .get(userId, date) as any;
  const allComplete = remaining.c === 0;

  if (allComplete) {
    const streak = bumpStreak(userId, date);
    const streakBonus = Math.min(100, streak * 5);
    const dailyBonus = 120 + streakBonus;
    awardXp(userId, dailyBonus, `All daily quests cleared (streak ${streak})`);
    xpGained += dailyBonus;
    rewards.push(`+${dailyBonus} XP (daily clear, streak ${streak})`);
    // Grant a mystery loot box style power-up
    db.prepare(
      `INSERT INTO power_ups (user_id, power_up_key, quantity) VALUES (?, 'essence_stone', 1)
       ON CONFLICT(user_id, power_up_key) DO UPDATE SET quantity = quantity + 1`
    ).run(userId);
    rewards.push('+1 Essence Stone');
    db.prepare(
      'INSERT INTO notifications (user_id, kind, title, body, created_at) VALUES (?,?,?,?,?)'
    ).run(
      userId,
      'daily_clear',
      `[ DAILY QUEST CLEARED ]`,
      `All targets met. Streak: ${streak} day(s). Rewards delivered.`,
      Date.now()
    );
  }

  checkAchievements(userId);
  const updated = db.prepare('SELECT * FROM daily_quests WHERE id = ?').get(row.id) as any;
  return { quest: rowToQuest(updated), allComplete, xpGained, rewards };
}
