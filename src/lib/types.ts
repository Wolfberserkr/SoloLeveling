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
