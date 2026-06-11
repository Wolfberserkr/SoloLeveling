// ═════════════════════════════════════════════════════════════════════════
// game — the player-action router. Every state mutation that grants XP,
// completes quests, or touches resources goes through here with the
// service-role key. Clients can only SELECT (RLS); they cannot forge rewards.
// ═════════════════════════════════════════════════════════════════════════
import { adminClient } from '../_shared/db.ts';
import { requireUser, HttpError, json, CORS_HEADERS } from '../_shared/auth.ts';
import { localDateInTz, previousDate, startOfIsoWeek } from '../_shared/time.ts';
import { trainingTargetsFor, isTrainingComplete } from '../_shared/game/training.ts';
import { rollTrainingVariant, rollSideQuests } from '../_shared/game/daily.ts';
import {
  dungeonPhaseFor,
  allDungeonsCleared,
  isBossReady,
  bossDefeated,
} from '../_shared/game/dungeons.ts';
import {
  sleepBonus,
  clampMana,
  MANA_COSTS,
  DAILY_REGEN,
  POOR_SLEEP_HOURS,
  LOW_MANA_THRESHOLD,
  FATIGUE_THRESHOLD,
  RECOVERY_DAY_MANA,
  POTION_RESTORE_MIN,
  POTION_RESTORE_MAX,
} from '../_shared/game/mana.ts';
import {
  MAX_ACTIVE_BOOKS,
  MAX_QUESTIONS_PER_BOOK,
  MAX_SESSION_PAGES,
  MIN_BOOK_PAGES,
  MAX_BOOK_PAGES,
  MIN_REFLECTION_CHARS,
  MIN_APPLICATION_CHARS,
  readingXp,
  bookFinishXp,
  isBookFinished,
  initialDueDate,
  reviewOutcome,
} from '../_shared/game/library.ts';
import {
  TRAINING_XP,
  PERFECT_CLEAR_XP,
  GYM_SESSION_XP,
  BOSS_CLEAR_XP,
  REFLECTION_XP,
  APPLY_XP,
  RETENTION_PASS_XP,
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
      case 'complete-gym':
        return json(await completeGym(ctx, payload));
      case 'attempt-boss':
        return json(await attemptBoss(ctx, payload));
      case 'log-metrics':
        return json(await logMetrics(ctx, payload));
      case 'add-book':
        return json(await addBook(ctx, payload));
      case 'log-reading':
        return json(await logReading(ctx, payload));
      case 'log-application':
        return json(await logApplication(ctx, payload));
      case 'add-question':
        return json(await addQuestion(ctx, payload));
      case 'review-question':
        return json(await reviewQuestion(ctx, payload));
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
  // Each cleared dungeon raises the baseline one notch.
  const dungeon = await getDungeonProgress(ctx);
  const targets = trainingTargetsFor(profile.level, dungeon.cycles_cleared, loadModifier, variant);
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

  // Knowledge checks falling due surface once, at the day's first contact.
  const { count: dueChecks } = await db
    .from('retention_questions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('mastered', false)
    .lte('due_date', today);
  if ((dueChecks ?? 0) > 0) {
    await db.from('system_messages').insert({
      user_id: userId,
      kind: 'knowledge_check',
      title: 'Knowledge check.',
      body: `${dueChecks} retention ${dueChecks === 1 ? 'question awaits' : 'questions await'} in the Library. The System tests what you claim to have learned.`,
      payload: { due: dueChecks },
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

async function getDungeonProgress(ctx: Ctx) {
  const { data } = await ctx.db
    .from('dungeon_progress')
    .select('*')
    .eq('user_id', ctx.userId)
    .maybeSingle();
  if (data) return data;
  // Self-heal accounts created before the dungeons migration.
  const { data: created, error } = await ctx.db
    .from('dungeon_progress')
    .insert({ user_id: ctx.userId })
    .select('*')
    .single();
  if (error || !created) throw new HttpError(500, 'Dungeon progress missing');
  return created;
}

async function getDailySnapshot(ctx: Ctx) {
  const [quest, sideQuests, dungeon, gymToday] = await Promise.all([
    getTodayQuest(ctx),
    getTodaySideQuests(ctx),
    getDungeonProgress(ctx),
    ctx.db
      .from('gym_sessions')
      .select('id')
      .eq('user_id', ctx.userId)
      .eq('local_date', ctx.today)
      .maybeSingle()
      .then((r) => r.data),
  ]);
  return {
    ok: true,
    today: ctx.today,
    training: quest,
    quests: sideQuests,
    dungeon,
    gym_done_today: Boolean(gymToday),
  };
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

// ── complete-gym: one dungeon run per day — spend mana, earn XP ─────────────
async function completeGym(ctx: Ctx, payload: { notes?: string }) {
  const { db, userId, profile, today } = ctx;
  const dungeon = await getDungeonProgress(ctx);
  if (allDungeonsCleared(dungeon.phase)) {
    throw new HttpError(409, 'All dungeons cleared. Await the next System expansion.');
  }
  if (profile.mana < MANA_COSTS.gym) {
    throw new HttpError(409, 'Insufficient mana. Recover before entering the dungeon.');
  }

  const notes = typeof payload.notes === 'string' ? payload.notes.slice(0, 2000) : '';
  const { error: insertErr } = await db.from('gym_sessions').insert({
    user_id: userId,
    local_date: today,
    phase: dungeon.phase,
    notes,
  });
  if (insertErr) {
    if (insertErr.code === '23505') throw new HttpError(409, 'Dungeon already cleared today');
    console.error('gym_sessions insert failed:', insertErr);
    throw new HttpError(500, 'Failed to record dungeon run');
  }

  const mana = clampMana(profile.mana - MANA_COSTS.gym, profile.mana_max);
  await db.from('profiles').update({ mana }).eq('user_id', userId);
  profile.mana = mana;

  const sessionsCompleted = dungeon.sessions_completed + 1;
  await db
    .from('dungeon_progress')
    .update({ sessions_completed: sessionsCompleted, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  const def = dungeonPhaseFor(dungeon.phase);
  const bossReady = isBossReady(dungeon.phase, sessionsCompleted);
  if (bossReady && dungeon.sessions_completed < def.sessionsRequired) {
    await db.from('system_messages').insert({
      user_id: userId,
      kind: 'boss_ready',
      title: `Boss detected — ${def.boss.name}.`,
      body: `You have cleared enough of ${def.name}. The dungeon boss awaits your challenge.`,
      payload: { phase: dungeon.phase },
    });
  }

  const award = await awardXp(ctx, GYM_SESSION_XP, 'gym_session', null);
  return {
    ok: true,
    award,
    mana,
    dungeon: { ...dungeon, sessions_completed: sessionsCompleted },
    boss_ready: bossReady,
  };
}

// ── attempt-boss: benchmark test; defeat clears the dungeon phase ───────────
async function attemptBoss(ctx: Ctx, payload: { confirmed?: Record<string, unknown> }) {
  const { db, userId, today } = ctx;
  const dungeon = await getDungeonProgress(ctx);
  if (allDungeonsCleared(dungeon.phase)) throw new HttpError(409, 'All dungeons cleared');
  if (!isBossReady(dungeon.phase, dungeon.sessions_completed)) {
    throw new HttpError(409, 'The boss has not appeared yet. Keep clearing runs.');
  }
  if (dungeon.last_boss_attempt === today) {
    throw new HttpError(409, 'One boss attempt per day. Recover and return.');
  }

  const def = dungeonPhaseFor(dungeon.phase);
  const confirmed = payload.confirmed && typeof payload.confirmed === 'object' ? payload.confirmed : {};
  const victory = bossDefeated(dungeon.phase, confirmed);

  if (!victory) {
    await db
      .from('dungeon_progress')
      .update({ last_boss_attempt: today, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    await db.from('system_messages').insert({
      user_id: userId,
      kind: 'boss_failed',
      title: `${def.boss.name} stands.`,
      body: 'Not every benchmark fell today. The boss does not move — train, recover, and challenge it again tomorrow.',
      payload: { phase: dungeon.phase },
    });
    return { ok: true, victory: false, boss: def.boss.name };
  }

  const nextPhase = dungeon.phase + 1;
  await db
    .from('dungeon_progress')
    .update({
      phase: nextPhase,
      sessions_completed: 0,
      cycles_cleared: dungeon.cycles_cleared + 1,
      last_boss_attempt: today,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  // One-shot reward — exempt from the daily cap (see award_xp).
  const award = await awardXp(ctx, BOSS_CLEAR_XP, 'boss_clear', null, false);

  const cleared = allDungeonsCleared(nextPhase);
  await db.from('system_messages').insert({
    user_id: userId,
    kind: 'dungeon_cleared',
    title: `DUNGEON CLEARED — ${def.boss.name} has fallen.`,
    body: cleared
      ? `${def.name} is complete. Every dungeon the System prepared has been cleared. Your daily baseline rises once more.`
      : `${def.name} is complete. ${dungeonPhaseFor(nextPhase).name} is now open, and your Daily Training Quest baseline rises.`,
    payload: { phase: dungeon.phase, next_phase: nextPhase },
  });

  return {
    ok: true,
    victory: true,
    boss: def.boss.name,
    award,
    dungeon: {
      ...dungeon,
      phase: nextPhase,
      sessions_completed: 0,
      cycles_cleared: dungeon.cycles_cleared + 1,
    },
    all_cleared: cleared,
  };
}

// ── log-metrics: weekly body measurements ───────────────────────────────────
// One entry per ISO week: logging again in the same week refines that entry;
// a new week opens a new row. Keeps the trend line weekly-spaced.
async function logMetrics(
  ctx: Ctx,
  payload: {
    weight_kg?: number;
    body_fat_pct?: number;
    waist_cm?: number;
    chest_cm?: number;
    arm_cm?: number;
    notes?: string;
  },
) {
  const fields = {
    weight_kg: metric(payload.weight_kg, 20, 400),
    body_fat_pct: metric(payload.body_fat_pct, 1, 75),
    waist_cm: metric(payload.waist_cm, 30, 250),
    chest_cm: metric(payload.chest_cm, 30, 250),
    arm_cm: metric(payload.arm_cm, 10, 80),
  };
  if (Object.values(fields).every((v) => v === null)) {
    throw new HttpError(400, 'Nothing to log');
  }

  // Only overwrite the fields provided; re-logging refines this week's entry.
  const update: Record<string, unknown> = { notes: String(payload.notes ?? '').slice(0, 2000) };
  for (const [k, v] of Object.entries(fields)) if (v !== null) update[k] = v;

  const weekStart = startOfIsoWeek(ctx.today);
  const { data: existing } = await ctx.db
    .from('body_metrics')
    .select('local_date')
    .eq('user_id', ctx.userId)
    .gte('local_date', weekStart)
    .lte('local_date', ctx.today)
    .order('local_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = existing
    ? await ctx.db
        .from('body_metrics')
        .update(update)
        .eq('user_id', ctx.userId)
        .eq('local_date', existing.local_date)
        .select('*')
        .single()
    : await ctx.db
        .from('body_metrics')
        .insert({ user_id: ctx.userId, local_date: ctx.today, ...update })
        .select('*')
        .single();
  if (error || !data) throw new HttpError(500, 'Failed to log metrics');

  return { ok: true, metrics: data, updated_existing: Boolean(existing) };
}

function metric(n: unknown, min: number, max: number): number | null {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= min || v >= max) return null;
  return v;
}

// ── Library (Phase 4): Read → Reflect → Apply → Retain ──────────────────────
async function getBook(ctx: Ctx, bookId: unknown) {
  const id = typeof bookId === 'string' ? bookId : '';
  if (!id) throw new HttpError(400, 'book_id required');
  const { data } = await ctx.db
    .from('books')
    .select('*')
    .eq('user_id', ctx.userId)
    .eq('id', id)
    .maybeSingle();
  if (!data) throw new HttpError(404, 'No such tome');
  return data;
}

// ── add-book: register a tome on the shelf ──────────────────────────────────
async function addBook(
  ctx: Ctx,
  payload: { title?: string; author?: string; total_pages?: number },
) {
  const title = String(payload.title ?? '').trim().slice(0, 200);
  if (!title) throw new HttpError(400, 'A tome needs a title');
  const author = String(payload.author ?? '').trim().slice(0, 200);
  const totalPages = Math.round(sanitize(payload.total_pages, MAX_BOOK_PAGES));
  if (totalPages < MIN_BOOK_PAGES) {
    throw new HttpError(400, `A tome needs at least ${MIN_BOOK_PAGES} pages`);
  }

  const { count } = await ctx.db
    .from('books')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .eq('status', 'reading');
  if ((count ?? 0) >= MAX_ACTIVE_BOOKS) {
    throw new HttpError(409, `Shelf full — finish a tome before opening an ${MAX_ACTIVE_BOOKS + 1}th.`);
  }

  const { data: book, error } = await ctx.db
    .from('books')
    .insert({
      user_id: ctx.userId,
      title,
      author,
      total_pages: totalPages,
      started_date: ctx.today,
    })
    .select('*')
    .single();
  if (error || !book) throw new HttpError(500, 'Failed to add tome');

  return { ok: true, book };
}

// ── log-reading: Read (+ Reflect) — one session per tome per day ────────────
async function logReading(
  ctx: Ctx,
  payload: { book_id?: string; pages?: number; reflection?: string },
) {
  const { db, userId, profile, today } = ctx;
  const book = await getBook(ctx, payload.book_id);
  if (book.status !== 'reading') throw new HttpError(409, 'This tome is closed');

  const pages = Math.round(sanitize(payload.pages, MAX_SESSION_PAGES));
  if (pages <= 0) throw new HttpError(400, 'Nothing to log');
  if (profile.mana < MANA_COSTS.reading) {
    throw new HttpError(409, 'Insufficient mana. Recover before opening the tome.');
  }

  const reflection = String(payload.reflection ?? '').trim().slice(0, 2000);
  const { error: insertErr } = await db.from('reading_sessions').insert({
    user_id: userId,
    book_id: book.id,
    local_date: today,
    pages,
    reflection,
  });
  if (insertErr) {
    if (insertErr.code === '23505') throw new HttpError(409, 'Already logged this tome today');
    console.error('reading_sessions insert failed:', insertErr);
    throw new HttpError(500, 'Failed to log reading');
  }

  const pagesRead = Math.min(book.total_pages, book.pages_read + pages);
  const finished = isBookFinished(pagesRead, book.total_pages);
  const { data: updated } = await db
    .from('books')
    .update({
      pages_read: pagesRead,
      ...(finished ? { status: 'finished', finished_date: today } : {}),
    })
    .eq('id', book.id)
    .select('*')
    .single();

  const mana = clampMana(profile.mana - MANA_COSTS.reading, profile.mana_max);
  await db.from('profiles').update({ mana }).eq('user_id', userId);
  profile.mana = mana;

  // Read pays by pages; a genuine written reflection pays its bonus on top.
  const reflected = reflection.length >= MIN_REFLECTION_CHARS;
  const award = await awardXp(
    ctx,
    readingXp(pages) + (reflected ? REFLECTION_XP : 0),
    'reading_session',
    book.id,
  );

  let finishAward = null;
  if (finished) {
    // One-shot per tome — exempt from the daily cap, like a boss clear.
    finishAward = await awardXp(ctx, bookFinishXp(book.total_pages), 'book_finished', book.id, false);
    await db.from('system_messages').insert({
      user_id: userId,
      kind: 'book_finished',
      title: `TOME CLEARED — “${book.title}”.`,
      body: `${book.total_pages} pages conquered. Knowledge fades unless tested — your banked questions will keep coming due. Apply what you learned.`,
      payload: { book_id: book.id },
    });
  }

  return {
    ok: true,
    book: updated ?? { ...book, pages_read: pagesRead },
    pages,
    reflected,
    award,
    finish_award: finishAward,
    finished,
    mana,
  };
}

// ── log-application: Apply — one concrete action per tome per day ───────────
async function logApplication(ctx: Ctx, payload: { book_id?: string; action?: string }) {
  const book = await getBook(ctx, payload.book_id);
  const action = String(payload.action ?? '').trim().slice(0, 500);
  if (action.length < MIN_APPLICATION_CHARS) {
    throw new HttpError(400, 'Describe the action concretely — what did you actually do?');
  }

  const { data: application, error } = await ctx.db
    .from('book_applications')
    .insert({ user_id: ctx.userId, book_id: book.id, local_date: ctx.today, action })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') throw new HttpError(409, 'Already applied from this tome today');
    console.error('book_applications insert failed:', error);
    throw new HttpError(500, 'Failed to log application');
  }

  const award = await awardXp(ctx, APPLY_XP, 'book_applied', book.id);
  return { ok: true, application, award };
}

// ── add-question: Retain — bank a question for future knowledge checks ──────
async function addQuestion(
  ctx: Ctx,
  payload: { book_id?: string; prompt?: string; answer?: string },
) {
  const book = await getBook(ctx, payload.book_id);
  const prompt = String(payload.prompt ?? '').trim().slice(0, 500);
  if (prompt.length < 5) throw new HttpError(400, 'Question too short');
  const answer = String(payload.answer ?? '').trim().slice(0, 1000);

  const { count } = await ctx.db
    .from('retention_questions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .eq('book_id', book.id);
  if ((count ?? 0) >= MAX_QUESTIONS_PER_BOOK) {
    throw new HttpError(409, 'Question bank full for this tome — master what you have.');
  }

  const { data: question, error } = await ctx.db
    .from('retention_questions')
    .insert({
      user_id: ctx.userId,
      book_id: book.id,
      prompt,
      answer,
      due_date: initialDueDate(ctx.today),
    })
    .select('*')
    .single();
  if (error || !question) throw new HttpError(500, 'Failed to bank question');

  return { ok: true, question };
}

// ── review-question: resolve a due knowledge check (self-graded) ────────────
async function reviewQuestion(ctx: Ctx, payload: { question_id?: string; recalled?: boolean }) {
  const id = typeof payload.question_id === 'string' ? payload.question_id : '';
  if (!id) throw new HttpError(400, 'question_id required');

  const { data: question } = await ctx.db
    .from('retention_questions')
    .select('*')
    .eq('user_id', ctx.userId)
    .eq('id', id)
    .maybeSingle();
  if (!question) throw new HttpError(404, 'No such question');
  if (question.mastered) throw new HttpError(409, 'Already mastered');
  if (!question.due_date || question.due_date > ctx.today) {
    throw new HttpError(409, 'Not yet due — the System decides when to test you.');
  }

  const recalled = payload.recalled === true;
  const outcome = reviewOutcome(question.stage, recalled, ctx.today);
  const { data: updated } = await ctx.db
    .from('retention_questions')
    .update({
      stage: outcome.stage,
      due_date: outcome.dueDate,
      mastered: outcome.mastered,
      times_reviewed: question.times_reviewed + 1,
    })
    .eq('id', question.id)
    .select('*')
    .single();

  // Honest recall pays; a lapse costs nothing but the climb back.
  const award = recalled ? await awardXp(ctx, RETENTION_PASS_XP, 'knowledge_check', question.id) : null;

  return {
    ok: true,
    recalled,
    mastered: outcome.mastered,
    question: updated ?? { ...question, ...outcome },
    award,
  };
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
async function awardXp(
  ctx: Ctx,
  amount: number,
  source: string,
  sourceRef: string | null,
  capEligible = true,
) {
  const { data: award, error } = await ctx.db.rpc('award_xp', {
    p_user: ctx.userId,
    p_amount: amount,
    p_source: source,
    p_source_ref: sourceRef,
    p_cap_eligible: capEligible,
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
