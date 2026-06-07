// Random Gates — emergent special quests that appear unannounced with a 24h
// timer. Spawn check fires once per day (gated by hunter_stats.last_gate_check)
// from processDailyEvents. Progress mirrors into compatible daily-quest /
// workout-volume actions automatically. Expiry sweeps lazily on gate-list reads.

import { getAdminSupabase } from './supabase/admin';
import { awardXp } from './leveling';
import { grant } from './powerups';

export type GateStatus = 'active' | 'cleared' | 'failed' | 'expired';

export type Gate = {
  id: number;
  gate_key: string;
  label: string;
  rank: string;
  target: number;
  progress: number;
  unit: string | null;
  mirrors: string | null;
  status: GateStatus;
  spawned_at: string;
  expires_at: string;
  reward_xp: number;
  reward_extra: string | null;
};

type Template = {
  key: string;
  label: string;
  rank: 'D' | 'C' | 'B' | 'A' | 'S';
  target: number;
  unit: string;
  mirrors: string; // matches a daily_quests.quest_key OR 'workout_volume'
  reward_xp: number;
  reward_extra?: string; // e.g. 'epic_shadow', 'rune_of_focus', 'essence_stone:3'
  minLevel: number;
};

export const GATE_TEMPLATES: Template[] = [
  {
    key: 'red_pushup_swarm',
    label: 'RED GATE — Orc Horde',
    rank: 'D',
    target: 60,
    unit: 'reps',
    mirrors: 'pushups',
    reward_xp: 350,
    reward_extra: 'essence_stone:1',
    minLevel: 1,
  },
  {
    key: 'red_situp_pact',
    label: 'RED GATE — Pact of the Core',
    rank: 'D',
    target: 60,
    unit: 'reps',
    mirrors: 'situps',
    reward_xp: 350,
    reward_extra: 'essence_stone:1',
    minLevel: 1,
  },
  {
    key: 'blue_squat_descent',
    label: 'BLUE GATE — Descent of Titans',
    rank: 'C',
    target: 80,
    unit: 'reps',
    mirrors: 'squats',
    reward_xp: 500,
    reward_extra: 'rune_of_focus',
    minLevel: 3,
  },
  {
    key: 'blue_run_chase',
    label: 'BLUE GATE — Chase the Beast',
    rank: 'C',
    target: 3,
    unit: 'km',
    mirrors: 'run',
    reward_xp: 500,
    reward_extra: 'rune_of_focus',
    minLevel: 3,
  },
  {
    key: 'gold_volume_vault',
    label: 'GOLD GATE — Treasure Vault',
    rank: 'B',
    target: 2500,
    unit: 'kg',
    mirrors: 'workout_volume',
    reward_xp: 800,
    reward_extra: 'elixir_of_life',
    minLevel: 5,
  },
  {
    key: 'gold_volume_titan',
    label: 'GOLD GATE — Titan Cache',
    rank: 'A',
    target: 5000,
    unit: 'kg',
    mirrors: 'workout_volume',
    reward_xp: 1200,
    reward_extra: 'shadow_extraction',
    minLevel: 12,
  },
];

const SPAWN_CHANCE = 0.12; // ~12% per day
const GATE_DURATION_HOURS = 24;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function activeGate(userId: string): Promise<Gate | null> {
  const sb = getAdminSupabase();
  const { data } = await sb
    .from('gates')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  return (data as Gate) || null;
}

// Sweep expired gates → 'expired' status. Lazy, called on reads.
export async function sweepExpiredGates(userId: string) {
  const sb = getAdminSupabase();
  const nowIso = new Date().toISOString();
  await sb
    .from('gates')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .eq('status', 'active')
    .lt('expires_at', nowIso);
}

export async function recentGates(userId: string, limit = 10): Promise<Gate[]> {
  const sb = getAdminSupabase();
  await sweepExpiredGates(userId);
  const { data } = await sb
    .from('gates')
    .select('*')
    .eq('user_id', userId)
    .order('spawned_at', { ascending: false })
    .limit(limit);
  return (data as Gate[]) || [];
}

export async function maybeSpawnGate(userId: string): Promise<Gate | null> {
  const sb = getAdminSupabase();
  const today = todayISO();

  // Don't double-roll the same day.
  const { data: stats } = await sb
    .from('hunter_stats')
    .select('level, last_gate_check')
    .eq('user_id', userId)
    .single();
  if (!stats || stats.last_gate_check === today) return null;

  // Mark today checked regardless of outcome (avoids retry storms).
  await sb
    .from('hunter_stats')
    .update({ last_gate_check: today })
    .eq('user_id', userId);

  // Already have an active gate? Don't stack.
  const existing = await activeGate(userId);
  if (existing) return null;

  if (Math.random() >= SPAWN_CHANCE) return null;

  const eligible = GATE_TEMPLATES.filter((t) => stats.level >= t.minLevel);
  if (eligible.length === 0) return null;
  const tpl = eligible[Math.floor(Math.random() * eligible.length)];

  const expiresAt = new Date(Date.now() + GATE_DURATION_HOURS * 3600 * 1000).toISOString();

  const { data: inserted, error } = await sb
    .from('gates')
    .insert({
      user_id: userId,
      gate_key: tpl.key,
      label: tpl.label,
      rank: tpl.rank,
      target: tpl.target,
      unit: tpl.unit,
      mirrors: tpl.mirrors,
      expires_at: expiresAt,
      reward_xp: tpl.reward_xp,
      reward_extra: tpl.reward_extra || null,
    })
    .select('*')
    .single();
  // Partial unique index could race-reject; treat as no-op.
  if (error || !inserted) return null;

  await sb.from('notifications').insert({
    user_id: userId,
    kind: 'gate',
    title: `[ GATE DETECTED ]  ${tpl.label}`,
    body: `Rank ${tpl.rank} · ${tpl.target} ${tpl.unit} · 24:00 remaining. Reward: +${tpl.reward_xp} XP${tpl.reward_extra ? ` + ${tpl.reward_extra}` : ''}.`,
  });

  return inserted as Gate;
}

// Called from logQuestProgress + workouts/complete to mirror player progress
// into any active gate whose `mirrors` matches.
export async function progressActiveGate(
  userId: string,
  mirrors: string,
  amount: number
): Promise<{ cleared: boolean; gate: Gate | null }> {
  const sb = getAdminSupabase();
  const gate = await activeGate(userId);
  if (!gate || gate.mirrors !== mirrors) return { cleared: false, gate };

  // Expiry check — sweep and bail if past due.
  if (new Date(gate.expires_at).getTime() < Date.now()) {
    await sweepExpiredGates(userId);
    return { cleared: false, gate: null };
  }

  const newProgress = Math.min(gate.target, gate.progress + amount);
  const cleared = newProgress >= gate.target;

  if (!cleared) {
    await sb.from('gates').update({ progress: newProgress }).eq('id', gate.id);
    return { cleared: false, gate: { ...gate, progress: newProgress } };
  }

  // Cleared! Award and notify.
  await sb
    .from('gates')
    .update({ progress: newProgress, status: 'cleared' })
    .eq('id', gate.id);

  await awardXp(userId, gate.reward_xp, `Gate cleared: ${gate.label}`);

  if (gate.reward_extra) {
    await applyReward(userId, gate.reward_extra);
  }

  await sb.from('notifications').insert({
    user_id: userId,
    kind: 'gate',
    title: `[ GATE CLEARED ]  ${gate.label}`,
    body: `+${gate.reward_xp} XP${gate.reward_extra ? ` + ${gate.reward_extra}` : ''}.`,
  });

  return { cleared: true, gate: { ...gate, progress: newProgress, status: 'cleared' } };
}

async function applyReward(userId: string, extra: string) {
  // Format: 'item_key' or 'item_key:N'
  const [key, n] = extra.split(':');
  const qty = n ? Number(n) : 1;
  if (key === 'epic_shadow') {
    // Force-extract an epic shadow via the shadow lib.
    const { maybeExtractShadow } = await import('./shadows');
    // Inflate prCount to guarantee a roll + bias rarity upward.
    await maybeExtractShadow(userId, {
      session_key: 'gate_reward',
      deload: true,
      prCount: 3,
    });
    return;
  }
  // All other rewards are power-up grants.
  await grant(userId, key, qty);
}
