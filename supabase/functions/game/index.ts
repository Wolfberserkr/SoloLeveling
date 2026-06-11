// ═════════════════════════════════════════════════════════════════════════
// game — the player-action router. Every state mutation that grants XP,
// completes quests, or touches resources goes through here with the
// service-role key. Clients can only SELECT (RLS); they cannot forge rewards.
// ═════════════════════════════════════════════════════════════════════════
import { adminClient } from '../_shared/db.ts';
import { requireUser, HttpError, json, CORS_HEADERS } from '../_shared/auth.ts';
import { localDateInTz, previousDate } from '../_shared/time.ts';
import { trainingTargetsFor, isTrainingComplete } from '../_shared/game/training.ts';
import { rollTrainingVariant, rollSideQuests } from '../_shared/game/daily.ts';
import {
  sleepBonus,
  clampMana,
  DAILY_REGEN,
  POOR_SLEEP_HOURS,
  LOW_MANA_THRESHOLD,
  FATIGUE_THRESHOLD,
  RECOVERY_DAY_MANA,
  POTION_RESTORE_MIN,
  POTION_RESTORE_MAX,
} from '../_shared/game/mana.ts';
import {
  TRAINING_XP,
  PERFECT_CLEAR_XP,
  FAILURE_LOAD_MODIFIER,
} from '../_shared/game/constants.ts';

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
  mana_potions: number;
  fatigue: number;
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
      .select(
        'user_id, timezone, level, xp_total, rank, mana, mana_max, mana_potions, fatigue, last_daily_reset',
      )
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
      case 'complete-quest':
        return json(await completeSideQuest(ctx, payload));
      case 'log-sleep':
        return json(await logSleep(ctx, payload));
      case 'use-potion':
        return json(await usePotion(ctx));
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
  let fatigue = profile.fatigue;
  if (prev && prev.status === 'pending') {
    await db.from('training_quests').update({ status: 'failed' }).eq('id', prev.id);
    loadModifier = FAILURE_LOAD_MODIFIER;
    fatigue += 1;
    await db.from('system_messages').insert({
      user_id: userId,
      kind: 'training_adjusted',
      title: 'Training load adjusted.',
      body: 'Yesterday’s quest was not completed. Today’s load is reduced by 15%. Form over failure — the System adapts, it does not punish.',
    });
  }

  // Stale side quests expire; they never carry over.
  await db
    .from('daily_quests')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lt('local_date', today);

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

  // Mana regen: a new day restores capacity before anything is asked of you.
  const mana = clampMana(profile.mana + DAILY_REGEN, profile.mana_max);

  // Recovery triggers on state; otherwise the System rolls today's flavor.
  const recovery = mana < LOW_MANA_THRESHOLD || fatigue >= FATIGUE_THRESHOLD;
  const variant = recovery ? 'recovery' : rollTrainingVariant(userId, today);

  // Generate today's training quest (unique constraint makes this idempotent).
  const targets = trainingTargetsFor(profile.level, 0, loadModifier, variant);
  await db.from('training_quests').upsert(
    {
      user_id: userId,
      local_date: today,
      variant,
      pushups_target: targets.pushups,
      situps_target: targets.situps,
      squats_target: targets.squats,
      run_km_target: targets.runKm,
      load_modifier: loadModifier,
    },
    { onConflict: 'user_id,local_date', ignoreDuplicates: true },
  );

  // Roll today's side quests (deterministic per user+date → idempotent too).
  const sideQuests = rollSideQuests(userId, today);
  await db.from('daily_quests').upsert(
    sideQuests.map((q) => ({
      user_id: userId,
      local_date: today,
      quest_key: q.key,
      title: q.title,
      body: q.body,
      mana_cost: q.manaCost,
      xp_reward: q.xp,
    })),
    { onConflict: 'user_id,local_date,quest_key', ignoreDuplicates: true },
  );

  if (recovery) {
    await db.from('system_messages').insert({
      user_id: userId,
      kind: 'recovery_day',
      title: 'Recovery Protocol active.',
      body: 'Your reserves are low. Today’s training is light by design — complete it to restore mana and earn a potion. Recovery is training.',
    });
  }

  await db
    .from('profiles')
    .update({ last_daily_reset: today, mana, fatigue })
    .eq('user_id', userId);
  profile.mana = mana;
  profile.fatigue = fatigue;
  profile.last_daily_reset = today;
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

async function getTodaySideQuests(ctx: Ctx) {
  const { data, error } = await ctx.db
    .from('daily_quests')
    .select('*')
    .eq('user_id', ctx.userId)
    .eq('local_date', ctx.today)
    .order('quest_key');
  if (error) throw new HttpError(500, 'Side quests missing');
  return data ?? [];
}

async function getDailySnapshot(ctx: Ctx) {
  const [quest, sideQuests] = await Promise.all([getTodayQuest(ctx), getTodaySideQuests(ctx)]);
  return { ok: true, today: ctx.today, training: quest, quests: sideQuests };
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
  const { db, userId, profile, today } = ctx;
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

  // A completed day burns off accumulated fatigue; a completed Recovery day
  // also restores mana and pays a potion.
  const profileUpdate: Record<string, number> = { fatigue: 0 };
  if (quest.variant === 'recovery') {
    profileUpdate.mana = clampMana(profile.mana + RECOVERY_DAY_MANA, profile.mana_max);
    profileUpdate.mana_potions = profile.mana_potions + 1;
    await db.from('system_messages').insert({
      user_id: userId,
      kind: 'recovery_complete',
      title: 'Recovery complete.',
      body: `Mana +${RECOVERY_DAY_MANA}. Mana Potion ×1 earned. Reserves restored — return to full intensity tomorrow.`,
    });
  }
  await db.from('profiles').update(profileUpdate).eq('user_id', userId);
  profile.fatigue = 0;
  if (profileUpdate.mana !== undefined) profile.mana = profileUpdate.mana;
  if (profileUpdate.mana_potions !== undefined) profile.mana_potions = profileUpdate.mana_potions;

  // XP — through the one true gate.
  const award = await awardXp(ctx, TRAINING_XP, 'training_quest', quest.id);
  const perfect = await checkPerfectClear(ctx, { ...quest, status: 'completed' });

  return {
    ok: true,
    award,
    streak: newStreak,
    perfect,
    training: { ...quest, status: 'completed', perfect_clear: perfect !== null },
  };
}

// ── complete-quest: finish a side quest — spend mana, earn XP ───────────────
async function completeSideQuest(ctx: Ctx, payload: { key?: string }) {
  const { db, userId, profile } = ctx;
  const key = typeof payload.key === 'string' ? payload.key : '';

  const quests = await getTodaySideQuests(ctx);
  const quest = quests.find((q) => q.quest_key === key);
  if (!quest) throw new HttpError(404, 'No such quest today');
  if (quest.status !== 'pending') throw new HttpError(409, 'Quest already resolved');
  if (profile.mana < quest.mana_cost) {
    throw new HttpError(409, 'Insufficient mana. Recover before taking this on.');
  }

  await db
    .from('daily_quests')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', quest.id);

  const mana = clampMana(profile.mana - quest.mana_cost, profile.mana_max);
  await db.from('profiles').update({ mana }).eq('user_id', userId);
  profile.mana = mana;

  const award = await awardXp(ctx, quest.xp_reward, 'daily_quest', quest.id);
  const training = await getTodayQuest(ctx);
  const perfect = await checkPerfectClear(ctx, training);

  return {
    ok: true,
    award,
    mana,
    perfect,
    quest: { ...quest, status: 'completed' },
  };
}

// ── log-sleep: once per day; sleep is the regen side of the economy ────────
async function logSleep(ctx: Ctx, payload: { hours?: number }) {
  const { db, userId, profile, today } = ctx;
  const hours = sanitize(payload.hours, 24);
  if (hours <= 0) throw new HttpError(400, 'Invalid sleep duration');

  const { data: existing } = await db
    .from('sleep_logs')
    .select('local_date')
    .eq('user_id', userId)
    .eq('local_date', today)
    .maybeSingle();
  if (existing) throw new HttpError(409, 'Sleep already logged today');

  const bonus = sleepBonus(hours);
  const mana = clampMana(profile.mana + bonus.mana, profile.mana_max);

  await db.from('sleep_logs').insert({
    user_id: userId,
    local_date: today,
    hours,
    mana_gained: mana - profile.mana,
    potion_earned: bonus.potion,
  });
  await db
    .from('profiles')
    .update({ mana, mana_potions: profile.mana_potions + (bonus.potion ? 1 : 0) })
    .eq('user_id', userId);
  profile.mana = mana;
  if (bonus.potion) {
    profile.mana_potions += 1;
    await db.from('system_messages').insert({
      user_id: userId,
      kind: 'potion_earned',
      title: 'Mana Potion earned.',
      body: '8+ hours of sleep. Recovery behavior is the only way to earn potions — they cannot be bought.',
    });
  }

  // Poor sleep retargets an untouched training day to the Recovery variant.
  let training = await getTodayQuest(ctx);
  if (
    hours < POOR_SLEEP_HOURS &&
    training.status === 'pending' &&
    training.variant !== 'recovery' &&
    training.pushups_done === 0 &&
    training.situps_done === 0 &&
    training.squats_done === 0 &&
    Number(training.run_km_done) === 0
  ) {
    const targets = trainingTargetsFor(
      profile.level,
      0,
      Number(training.load_modifier),
      'recovery',
    );
    const { data: retargeted } = await db
      .from('training_quests')
      .update({
        variant: 'recovery',
        pushups_target: targets.pushups,
        situps_target: targets.situps,
        squats_target: targets.squats,
        run_km_target: targets.runKm,
      })
      .eq('id', training.id)
      .select('*')
      .single();
    if (retargeted) training = retargeted;
    await db.from('system_messages').insert({
      user_id: userId,
      kind: 'recovery_day',
      title: 'Recovery Protocol active.',
      body: 'Under 6 hours of sleep. Today’s training has been reduced to light movement — complete it to restore mana and earn a potion.',
    });
  }

  return {
    ok: true,
    hours,
    mana,
    potion: bonus.potion,
    potions: profile.mana_potions,
    training,
  };
}

// ── use-potion: spend an earned potion for a 20–50 mana restore ─────────────
async function usePotion(ctx: Ctx) {
  const { db, userId, profile } = ctx;
  if (profile.mana_potions <= 0) throw new HttpError(409, 'No Mana Potions');
  if (profile.mana >= profile.mana_max) throw new HttpError(409, 'Mana already full');

  const roll =
    POTION_RESTORE_MIN + Math.floor(Math.random() * (POTION_RESTORE_MAX - POTION_RESTORE_MIN + 1));
  const mana = clampMana(profile.mana + roll, profile.mana_max);
  const restored = mana - profile.mana;

  await db
    .from('profiles')
    .update({ mana, mana_potions: profile.mana_potions - 1 })
    .eq('user_id', userId);
  profile.mana = mana;
  profile.mana_potions -= 1;

  return { ok: true, restored, mana, potions: profile.mana_potions };
}

// ── Perfect Clear: training + every side quest done in one day ──────────────
async function checkPerfectClear(
  ctx: Ctx,
  training: { id: string; status: string; perfect_clear: boolean },
) {
  if (training.status !== 'completed' || training.perfect_clear) return null;

  const sideQuests = await getTodaySideQuests(ctx);
  if (sideQuests.length === 0 || !sideQuests.every((q) => q.status === 'completed')) return null;

  await ctx.db.from('training_quests').update({ perfect_clear: true }).eq('id', training.id);
  const award = await awardXp(ctx, PERFECT_CLEAR_XP, 'perfect_clear', training.id);
  await ctx.db.from('system_messages').insert({
    user_id: ctx.userId,
    kind: 'perfect_clear',
    title: 'PERFECT CLEAR.',
    body: `Every quest the System issued today has been completed. Bonus +${PERFECT_CLEAR_XP} XP.`,
  });
  return award;
}

// ── XP gate wrapper: rpc → level-up announcement ────────────────────────────
async function awardXp(ctx: Ctx, amount: number, source: string, sourceRef: string) {
  const { data: award, error } = await ctx.db.rpc('award_xp', {
    p_user: ctx.userId,
    p_amount: amount,
    p_source: source,
    p_source_ref: sourceRef,
    p_cap_eligible: true,
    p_local_date: ctx.today,
  });
  if (error) {
    console.error('award_xp failed:', error);
    throw new HttpError(500, 'XP award failed');
  }

  if (award.leveled_up) {
    ctx.profile.level = award.new_level;
    await ctx.db.from('system_messages').insert({
      user_id: ctx.userId,
      kind: 'level_up',
      title: `LEVEL UP — You have reached Level ${award.new_level}.`,
      body: 'Your limits have shifted. The Daily Training Quest will scale accordingly.',
      payload: { new_level: award.new_level },
    });
  }
  return award;
}
