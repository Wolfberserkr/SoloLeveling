import type { StatKey, TrainingVariant } from '@game/constants.ts';

export type Profile = {
  user_id: string;
  display_name: string;
  timezone: string;
  journey_started_at: string;
  level: number;
  xp_total: number;
  rank: string;
  class: string | null;
  mana: number;
  mana_max: number;
  mana_potions: number;
  essence_stones: number;
  equipped_title: string | null;
  fatigue: number;
  last_daily_reset: string | null;
  created_at: string;
};

export type StatRow = {
  user_id: string;
  stat: StatKey;
  value: number;
};

export type TrainingQuest = {
  id: string;
  user_id: string;
  local_date: string;
  variant: TrainingVariant;
  pushups_target: number;
  situps_target: number;
  squats_target: number;
  run_km_target: number;
  pushups_done: number;
  situps_done: number;
  squats_done: number;
  run_km_done: number;
  load_modifier: number;
  status: 'pending' | 'completed' | 'failed' | 'expired';
  perfect_clear: boolean;
  completed_at: string | null;
};

export type DailyQuest = {
  id: string;
  user_id: string;
  local_date: string;
  quest_key: string;
  title: string;
  body: string;
  mana_cost: number;
  xp_reward: number;
  status: 'pending' | 'completed' | 'expired';
  completed_at: string | null;
};

export type SleepLog = {
  user_id: string;
  local_date: string;
  hours: number;
  mana_gained: number;
  potion_earned: boolean;
};

export type DungeonProgress = {
  user_id: string;
  phase: number;
  sessions_completed: number;
  cycles_cleared: number;
  last_boss_attempt: string | null;
};

export type BodyMetrics = {
  user_id: string;
  local_date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  arm_cm: number | null;
  notes: string;
};

export type Book = {
  id: string;
  user_id: string;
  title: string;
  author: string;
  total_pages: number;
  pages_read: number;
  status: 'reading' | 'finished' | 'abandoned';
  started_date: string;
  finished_date: string | null;
  created_at: string;
};

export type RetentionQuestion = {
  id: string;
  user_id: string;
  book_id: string;
  prompt: string;
  answer: string;
  source: 'player' | 'system';
  stage: number;
  due_date: string | null;
  mastered: boolean;
  times_reviewed: number;
  created_at: string;
};

export type LiftLog = {
  id: string;
  user_id: string;
  local_date: string;
  exercise: string;
  weight_kg: number;
  reps: number;
};

export type SystemEvent = {
  id: string;
  user_id: string;
  local_date: string;
  kind: 'gate' | 'mana_surge' | 'xp_surge' | 'potion_gift' | 'riddle';
  title: string;
  body: string;
  payload: {
    challenge?: string;
    target?: number;
    label?: string;
    max_attempts?: number;
    attempts_used?: number;
  };
  status: 'active' | 'completed' | 'expired';
  xp_reward: number;
  completed_at: string | null;
};

export type SystemMessage = {
  id: string;
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
};

export type TrainingTotals = {
  total_pushups: number;
  total_situps: number;
  total_squats: number;
  total_run_km: number;
  days_completed: number;
  current_streak: number;
  best_streak: number;
  last_completed_date: string | null;
};

export type XpAward = {
  amount: number;
  credited: number;
  capped: boolean;
  xp_total: number;
  old_level: number;
  new_level: number;
  leveled_up: boolean;
};
