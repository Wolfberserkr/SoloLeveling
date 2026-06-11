// ═════════════════════════════════════════════════════════════════════════
// game — the player-action router. Every state mutation that grants XP,
// completes quests, or touches resources goes through here with the
// service-role key. Clients can only SELECT (RLS); they cannot forge rewards.
// ═════════════════════════════════════════════════════════════════════════
import { adminClient } from '../_shared/db.ts';
import { requireUser, HttpError, json, CORS_HEADERS } from '../_shared/auth.ts';
import { localDateInTz, previousDate } from '../_shared/time.ts';
import {
  trainingTargetsFor,
  isTrainingComplete,
  nextLoadModifier,
} from '../_shared/game/training.ts';
import { TRAINING_XP, FAILURE_LOAD_MODIFIER } from '../_shared/game/constants.ts';

type Ctx = {
  db: ReturnType<typeof adminClient>;
  userId: string;
  profile: Profile;
  today: string;
};

type Profile = {
  user_id: string;
  timezone: string;
  level: number;
  xp_total: number;
  rank: string;
  mana: number;
  mana_max: number;
  last_daily_reset: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const user = await requireUser(req);
    const { action, payload = {} } = await req.json();
    const db = adminClient();

    const { data: profile, error } = await db
      .from('profiles')
      .select('user_id, timezone, level, xp_total, rank, mana, mana_max, last_daily_reset')
      .eq('user_id', user.id)
      .single();
    if (error || !profile) throw new HttpError(404, 'Profile not found');

    const ctx: Ctx = {
      db,
      userId: user.id,
      profile: profile as Profile,
      today: localDateInTz(profile.timezone),
    };

    // Lazy daily reset: the System catches up before any action.
    await ensureDailyState(ctx);

    switch (action) {
      case 'ensure-daily':
        return json(await getDailySnapshot(ctx));
      case 'log-training':
        return json(await logTraining(ctx, payload));
      case 'complete-training':
        return json(await completeTraining(ctx));
      default:
        throw new HttpError(400, `Unknown action: ${action}`);
    }
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error('game function error:', err);
    return json({ error: 'Internal error' }, 500);
  }
});

// ── Daily reset (idempotent, keyed on profiles.last_daily_reset) ───────────
async function ensureDailyState(ctx: Ctx): Promise<void> {
  const { db, userId, profile, today } = ctx;
  if (profile.last_daily_reset === today) return;

  const yesterday = previousDate(today);

  // Close out yesterday's training quest if it was left pending.
  const { data: prev } = await db
    .from('training_quests')
    .select('id, status')
    .eq('user_id', userId)
    .eq('local_date', yesterday)
    .maybeSingle();

  let loadModifier = 1.0;
  if (prev && prev.status === 'pending') {
    await db.from('training_quests').update({ status: 'failed' }).eq('id', prev.id);
    loadModifier = FAILURE_LOAD_MODIFIER;
    await db.from('system_messages').insert({
      user_id: userId,
      kind: 'training_adjusted',
      title: 'Training load adjusted.',
      body: 'Yesterday’s quest was not completed. Today’s load is reduced by 15%. Form over failure — the System adapts, it does not punish.',
    });
  }

  // Streak break: missing a full day resets the counter.
  const { data: totals } = await db
    .from('training_totals')
    .select('current_streak, last_completed_date')
    .eq('user_id', userId)
    .single();
  if (
    totals &&
    totals.current_streak > 0 &&
    totals.last_completed_date !== yesterday &&
    totals.last_completed_date !== today
  ) {
    await db.from('training_totals').update({ current_streak: 0 }).eq('user_id', userId);
  }

  // Generate today's training quest (unique constraint makes this idempotent).
  const targets = trainingTargetsFor(profile.level, 0, loadModifier, 'standard');
  await db.from('training_quests').upsert(
    {
      user_id: userId,
      local_date: today,
      variant: 'standard',
      pushups_target: targets.pushups,
      situps_target: targets.situps,
      squats_target: targets.squats,
      run_km_target: targets.runKm,
      load_modifier: loadModifier,
    },
    { onConflict: 'user_id,local_date', ignoreDuplicates: true },
  );

  await db.from('profiles').update({ last_daily_reset: today }).eq('user_id', userId);
}

async function getTodayQuest(ctx: Ctx) {
  const { data, error } = await ctx.db
    .from('training_quests')
    .select('*')
    .eq('user_id', ctx.userId)
    .eq('local_date', ctx.today)
    .single();
  if (error || !data) throw new HttpError(500, 'Daily quest missing');
  return data;
}

async function getDailySnapshot(ctx: Ctx) {
  const quest = await getTodayQuest(ctx);
  return { ok: true, today: ctx.today, training: quest };
}

// ── log-training: increment progress on the four exercises ─────────────────
async function logTraining(
  ctx: Ctx,
  payload: { pushups?: number; situps?: number; squats?: number; run_km?: number },
) {
  const quest = await getTodayQuest(ctx);
  if (quest.status !== 'pending') throw new HttpError(409, 'Quest already resolved');

  const inc = {
    pushups: sanitize(payload.pushups, 500),
    situps: sanitize(payload.situps, 500),
    squats: sanitize(payload.squats, 500),
    run_km: sanitize(payload.run_km, 50),
  };
  if (inc.pushups + inc.situps + inc.squats + inc.run_km <= 0) {
    throw new HttpError(400, 'Nothing to log');
  }

  const updated = {
    pushups_done: Math.min(quest.pushups_target, quest.pushups_done + inc.pushups),
    situps_done: Math.min(quest.situps_target, quest.situps_done + inc.situps),
    squats_done: Math.min(quest.squats_target, quest.squats_done + inc.squats),
    run_km_done: Math.min(Number(quest.run_km_target), Number(quest.run_km_done) + inc.run_km),
  };

  const { data, error } = await ctx.db
    .from('training_quests')
    .update(updated)
    .eq('id', quest.id)
    .select('*')
    .single();
  if (error) throw new HttpError(500, 'Failed to log training');

  return { ok: true, training: data };
}

function sanitize(n: unknown, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(v, max);
}

// ── complete-training: validate, award XP, update totals & streak ──────────
async function completeTraining(ctx: Ctx) {
  const { db, userId, today } = ctx;
  const quest = await getTodayQuest(ctx);
  if (quest.status === 'completed') throw new HttpError(409, 'Already completed');
  if (quest.status !== 'pending') throw new HttpError(409, 'Quest already resolved');

  const targets = {
    pushups: quest.pushups_target,
    situps: quest.situps_target,
    squats: quest.squats_target,
    runKm: Number(quest.run_km_target),
  };
  const progress = {
    pushups: quest.pushups_done,
    situps: quest.situps_done,
    squats: quest.squats_done,
    runKm: Number(quest.run_km_done),
  };
  if (!isTrainingComplete(progress, targets)) {
    throw new HttpError(400, 'Targets not yet met');
  }

  await db
    .from('training_quests')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', quest.id);

  // Cumulative counters + streak.
  const { data: totals } = await db
    .from('training_totals')
    .select('*')
    .eq('user_id', userId)
    .single();
  const yesterday = previousDate(today);
  const newStreak =
    totals?.last_completed_date === yesterday ? (totals.current_streak ?? 0) + 1 : 1;
  await db
    .from('training_totals')
    .update({
      total_pushups: (totals?.total_pushups ?? 0) + quest.pushups_done,
      total_situps: (totals?.total_situps ?? 0) + quest.situps_done,
      total_squats: (totals?.total_squats ?? 0) + quest.squats_done,
      total_run_km: Number(totals?.total_run_km ?? 0) + Number(quest.run_km_done),
      days_completed: (totals?.days_completed ?? 0) + 1,
      current_streak: newStreak,
      best_streak: Math.max(totals?.best_streak ?? 0, newStreak),
      last_completed_date: today,
    })
    .eq('user_id', userId);

  // XP — through the one true gate.
  const { data: award, error: awardErr } = await db.rpc('award_xp', {
    p_user: userId,
    p_amount: TRAINING_XP,
    p_source: 'training_quest',
    p_source_ref: quest.id,
    p_cap_eligible: true,
    p_local_date: today,
  });
  if (awardErr) {
    console.error('award_xp failed:', awardErr);
    throw new HttpError(500, 'XP award failed');
  }

  if (award.leveled_up) {
    await db.from('system_messages').insert({
      user_id: userId,
      kind: 'level_up',
      title: `LEVEL UP — You have reached Level ${award.new_level}.`,
      body: 'Your limits have shifted. The Daily Training Quest will scale accordingly.',
      payload: { new_level: award.new_level },
    });
  }

  return {
    ok: true,
    award,
    streak: newStreak,
    training: { ...quest, status: 'completed' },
  };
}
