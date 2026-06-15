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
  sessionKindFor,
  isSessionKind,
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
import { ensureSystemEvent, type SystemEventRow } from '../_shared/eventEnsure.ts';
import { trainingXpWithEvent, sideQuestCostWithEvent, type SystemEventKind } from '../_shared/game/events.ts';
import {
  MAX_ACTIVE_BOOKS,
  MAX_QUESTIONS_PER_BOOK,
  ARCHIVE_SCAN_QUESTIONS,
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
  addDays,
} from '../_shared/game/library.ts';
import {
  LEGACY_HORIZON_DAYS,
  LEGACY_CLEAR_XP,
  compareLegacy,
  legacyReward,
  type LegacyMetrics,
} from '../_shared/game/legacy.ts';
import { answerMatches, RIDDLE_MAX_ATTEMPTS } from '../_shared/game/riddles.ts';
import { aiAvailable, generateBookQuestions } from '../_shared/ai.ts';
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
import { RANK_TITLES, RANKS } from '../_shared/game/constants.ts';
import {
  rankForLevel,
  statGainsFor,
  RANK_UP_ESSENCE,
  evaluateTitles,
  titleDef,
  type TitleState,
  classXpMultiplier,
  classDef,
  eligibleClasses,
  JOB_CHANGE_RANK,
  skillDef,
  skillPrereqError,
  skillCooldownRemaining,
  skillXpMultiplier,
  skillStatMultiplier,
  skillManaRegenBonus,
  hasStreakShield,
} from '../_shared/game/progression.ts';
import {
  SHADOW_EXTRACT_MANA,
  bossShadowGrade,
  gateShadowGrade,
  bookShadowGrade,
  shadowPassive,
  armyCapacity,
  extractChance,
  shadowXpMultiplier,
  shadowStatMultiplier,
  shadowManaRegenBonus,
  type DeployedShadow,
  type ShadowGrade,
  type ShadowSource,
} from '../_shared/game/shadows.ts';

type SkillRow = { skill_key: string; last_used_at: string | null };

type Ctx = {
  db: ReturnType<typeof adminClient>;
  userId: string;
  profile: Profile;
  today: string;
  skills: SkillRow[];
  skillKeys: string[];
  deployedShadows: DeployedShadow[];
};

type Profile = {
  user_id: string;
  timezone: string;
  level: number;
  xp_total: number;
  rank: string;
  class: string | null;
  essence_stones: number;
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
        'user_id, timezone, level, xp_total, rank, class, essence_stones, mana, mana_max, mana_potions, fatigue, last_daily_reset',
      )
      .eq('user_id', user.id)
      .single();
    if (error || !profile) throw new HttpError(404, 'Profile not found');

    const { data: skillRows } = await db
      .from('skills')
      .select('skill_key, last_used_at')
      .eq('user_id', user.id);
    const skills = (skillRows ?? []) as SkillRow[];

    // Deployed shadows confer passive buffs; load them once for the XP gate.
    const { data: shadowRows } = await db
      .from('shadows')
      .select('source_type, grade')
      .eq('user_id', user.id)
      .eq('status', 'arisen')
      .eq('deployed', true);
    const deployedShadows = (shadowRows ?? []) as DeployedShadow[];

    const ctx: Ctx = {
      db,
      userId: user.id,
      profile: profile as Profile,
      today: localDateInTz(profile.timezone),
      skills,
      skillKeys: skills.map((s) => s.skill_key),
      deployedShadows,
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
      case 'log-lift':
        return json(await logLift(ctx, payload));
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
      case 'complete-event':
        return json(await completeEvent(ctx));
      case 'answer-riddle':
        return json(await answerRiddle(ctx, payload));
      case 'generate-questions':
        return json(await generateQuestions(ctx, payload));
      case 'equip-title':
        return json(await equipTitle(ctx, payload));
      case 'choose-class':
        return json(await chooseClass(ctx, payload));
      case 'unlock-skill':
        return json(await unlockSkill(ctx, payload));
      case 'use-skill':
        return json(await useSkill(ctx, payload));
      case 'challenge-legacy':
        return json(await challengeLegacy(ctx));
      case 'extract-shadow':
        return json(await extractShadow(ctx, payload));
      case 'deploy-shadow':
        return json(await setShadowDeployed(ctx, payload, true));
      case 'recall-shadow':
        return json(await setShadowDeployed(ctx, payload, false));
      case 'reset-progress':
        return json(await resetProgress(ctx, payload));
      default:
        throw new HttpError(400, `Unknown action: ${action}`);
    }
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error('game function error:', err);
    return json({ error: 'Internal error' }, 500);
  }
});

// ── reset-progress: wipe all gameplay rows and re-seed a fresh account ──────
// Destructive and irreversible. The client gates this behind a typed
// confirmation; the server requires confirm === 'RESET' as a second guard.
// Device push subscriptions are kept (they are not progress), as is profile
// identity (display_name, timezone, reminder_hour).
const RESET_STATS = ['STR', 'END', 'AGI', 'INT', 'WIS', 'STA', 'WIL', 'DIS', 'CHA'];

async function resetProgress(ctx: Ctx, payload: { confirm?: string }) {
  const { db, userId, today } = ctx;
  if (payload?.confirm !== 'RESET') throw new HttpError(400, 'Reset not confirmed');

  // Child tables first. FK cascades from books / system_events would also
  // cover their dependents, but deleting explicitly keeps the order safe and
  // the intent obvious.
  const tables = [
    'riddle_answers',
    'reading_sessions',
    'book_applications',
    'retention_questions',
    'system_events',
    'books',
    'gym_sessions',
    'lift_logs',
    'body_metrics',
    'sleep_logs',
    'daily_quests',
    'training_quests',
    'xp_ledger',
    'legacy_snapshots',
    'shadows',
    'skills',
    'titles',
    'system_messages',
    'notification_log',
    'stats',
    'training_totals',
    'dungeon_progress',
  ];
  for (const table of tables) {
    const { error } = await db.from(table).delete().eq('user_id', userId);
    if (error) {
      console.error(`reset-progress: failed clearing ${table}:`, error);
      throw new HttpError(500, `Failed to clear ${table}`);
    }
  }

  // Re-seed the baseline rows handle_new_user creates for a fresh account.
  await db.from('stats').insert(RESET_STATS.map((stat) => ({ user_id: userId, stat })));
  await db.from('training_totals').insert({ user_id: userId });
  await db.from('dungeon_progress').insert({ user_id: userId });

  // Profile back to level 1; identity and notification settings are preserved.
  await db
    .from('profiles')
    .update({
      level: 1,
      xp_total: 0,
      rank: 'E',
      class: null,
      mana: 100,
      mana_max: 100,
      mana_potions: 0,
      essence_stones: 0,
      equipped_title: null,
      fatigue: 0,
      journey_started_at: today,
      last_daily_reset: null,
    })
    .eq('user_id', userId);

  await db.from('system_messages').insert({
    user_id: userId,
    kind: 'awakening',
    title: 'You have acquired the qualifications to be a Player.',
    body: 'The System has rebound itself to you. Your transformation begins anew. Complete your Daily Training Quest to earn experience. There are no shortcuts.',
  });

  return { ok: true, reset: true };
}

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
  // Steel Will (passive) forgives a single missed day before the streak breaks.
  const twoDaysAgo = previousDate(yesterday);
  const shielded =
    hasStreakShield(ctx.skillKeys) && totals?.last_completed_date === twoDaysAgo;
  if (
    totals &&
    totals.current_streak > 0 &&
    totals.last_completed_date !== yesterday &&
    totals.last_completed_date !== today &&
    !shielded
  ) {
    await db.from('training_totals').update({ current_streak: 0 }).eq('user_id', userId);
  }

  // Mana regen: a new day restores capacity before anything is asked of you.
  const mana = clampMana(
    profile.mana +
      DAILY_REGEN +
      skillManaRegenBonus(ctx.skillKeys) +
      shadowManaRegenBonus(ctx.deployedShadows),
    profile.mana_max,
  );

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

  // Roll today's System Event (deterministic; cron may have beaten us to it).
  await ensureSystemEvent(db, userId, today, profile.level);

  // The Legacy Boss: seed the first snapshot, and announce when one comes due.
  await ensureLegacy(ctx);

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

async function getTodayEvent(ctx: Ctx): Promise<SystemEventRow | null> {
  const { data } = await ctx.db
    .from('system_events')
    .select('*')
    .eq('user_id', ctx.userId)
    .eq('local_date', ctx.today)
    .maybeSingle();
  return (data as SystemEventRow) ?? null;
}

/** Kind of today's still-active event, for passive effects (surges). */
function activeKind(event: SystemEventRow | null): SystemEventKind | null {
  return event && event.status === 'active' ? (event.kind as SystemEventKind) : null;
}

async function getDailySnapshot(ctx: Ctx) {
  const [quest, sideQuests, dungeon, event, gymToday, legacy] = await Promise.all([
    getTodayQuest(ctx),
    getTodaySideQuests(ctx),
    getDungeonProgress(ctx),
    getTodayEvent(ctx),
    ctx.db
      .from('gym_sessions')
      .select('id')
      .eq('user_id', ctx.userId)
      .eq('local_date', ctx.today)
      .maybeSingle()
      .then((r) => r.data),
    getArmedLegacy(ctx),
  ]);
  return {
    ok: true,
    today: ctx.today,
    training: quest,
    quests: sideQuests,
    dungeon,
    event,
    gym_done_today: Boolean(gymToday),
    legacy,
    legacy_due: Boolean(legacy && legacy.due_date <= ctx.today),
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

  // XP — through the one true gate. An XP Surge amplifies today's training.
  const event = await getTodayEvent(ctx);
  const award = await awardXp(
    ctx,
    trainingXpWithEvent(TRAINING_XP, activeKind(event)),
    'training_quest',
    quest.id,
  );
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

  // A Mana Surge waives side-quest costs for the day.
  const event = await getTodayEvent(ctx);
  const manaCost = sideQuestCostWithEvent(quest.mana_cost, activeKind(event));
  if (profile.mana < manaCost) {
    throw new HttpError(409, 'Insufficient mana. Recover before taking this on.');
  }

  await db
    .from('daily_quests')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', quest.id);

  const mana = clampMana(profile.mana - manaCost, profile.mana_max);
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
async function completeGym(ctx: Ctx, payload: { notes?: string; kind?: string }) {
  const { db, userId, profile, today } = ctx;
  const dungeon = await getDungeonProgress(ctx);
  if (allDungeonsCleared(dungeon.phase)) {
    throw new HttpError(409, 'All dungeons cleared. Await the next System expansion.');
  }
  if (profile.mana < MANA_COSTS.gym) {
    throw new HttpError(409, 'Insufficient mana. Recover before entering the dungeon.');
  }

  // The Player picks the split session; the cycle is only the default.
  const kind = isSessionKind(payload.kind)
    ? payload.kind
    : sessionKindFor(dungeon.sessions_completed);
  const notes = typeof payload.notes === 'string' ? payload.notes.slice(0, 2000) : '';
  const { error: insertErr } = await db.from('gym_sessions').insert({
    user_id: userId,
    local_date: today,
    phase: dungeon.phase,
    session_kind: kind,
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

  // The fallen boss becomes an extractable shadow (Phase 9).
  await dropShadow(ctx, 'boss', String(dungeon.phase), def.boss.name, bossShadowGrade(dungeon.phase));

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

// ── log-lift: top-set weight for an exercise — PRs announced ────────────────
// One entry per exercise per day; re-logging the same day refines it. The
// previous all-time best is read before the write so corrections made later
// the same day can't fake a record.
async function logLift(
  ctx: Ctx,
  payload: { exercise?: string; weight_kg?: number; reps?: number },
) {
  const exercise = String(payload.exercise ?? '').trim().slice(0, 100);
  if (exercise.length < 2) throw new HttpError(400, 'Which exercise?');
  const weight = Number(payload.weight_kg);
  if (!Number.isFinite(weight) || weight <= 0 || weight > 1000) {
    throw new HttpError(400, 'Implausible weight');
  }
  const reps = Math.round(sanitize(payload.reps, 100));

  const { data: prior } = await ctx.db
    .from('lift_logs')
    .select('weight_kg')
    .eq('user_id', ctx.userId)
    .eq('exercise', exercise)
    .lt('local_date', ctx.today)
    .order('weight_kg', { ascending: false })
    .limit(1);
  const prevBest = Number(prior?.[0]?.weight_kg ?? 0);

  const { data: lift, error } = await ctx.db
    .from('lift_logs')
    .upsert(
      {
        user_id: ctx.userId,
        local_date: ctx.today,
        exercise,
        weight_kg: Math.round(weight * 100) / 100,
        reps,
      },
      { onConflict: 'user_id,local_date,exercise' },
    )
    .select('*')
    .single();
  if (error || !lift) throw new HttpError(500, 'Failed to log lift');

  const pr = prevBest > 0 && weight > prevBest;
  if (pr) {
    await ctx.db.from('system_messages').insert({
      user_id: ctx.userId,
      kind: 'lift_pr',
      title: `RECORD BROKEN — ${exercise}.`,
      body: `${weight} kg surpasses your previous best of ${prevBest} kg. The Iron Golem takes note.`,
      payload: { exercise, weight_kg: weight, prev_best: prevBest },
    });
  }

  return { ok: true, lift, pr, prev_best: prevBest };
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
    // A finished tome leaves a shadow of its knowledge (Phase 9).
    await dropShadow(ctx, 'book', book.id, book.title, bookShadowGrade(book.total_pages));
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

// ── complete-event: report a cleared Gate (self-reported, like a boss) ──────
async function completeEvent(ctx: Ctx) {
  const event = await getTodayEvent(ctx);
  if (!event) throw new HttpError(404, 'No event today');
  if (event.kind !== 'gate') throw new HttpError(409, 'This event resolves on its own');
  if (event.status === 'completed') throw new HttpError(409, 'Gate already cleared');
  if (event.status !== 'active') throw new HttpError(409, 'The gate has closed');

  await ctx.db
    .from('system_events')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', event.id);

  const award = await awardXp(ctx, event.xp_reward, 'gate_clear', event.id);
  await ctx.db.from('system_messages').insert({
    user_id: ctx.userId,
    kind: 'gate_cleared',
    title: 'GATE CLEARED.',
    body: `The emergency quest is complete. +${event.xp_reward} XP. The System closes the gate behind you.`,
    payload: { event_id: event.id },
  });

  // The sealed Gate leaves a shadow behind (Phase 9).
  await dropShadow(ctx, 'gate', event.id, 'Gate Sentinel', gateShadowGrade(ctx.profile.level));

  return { ok: true, award, event: { ...event, status: 'completed' } };
}

// ── answer-riddle: one of RIDDLE_MAX_ATTEMPTS guesses at today's riddle ─────
// The answer never leaves the server until the riddle resolves: correct,
// out of attempts, or midnight. Attempts live in the event payload (clients
// can read but not write system_events), the answer in riddle_answers
// (clients can do neither).
async function answerRiddle(ctx: Ctx, payload: { guess?: string }) {
  const { db, userId } = ctx;
  const event = await getTodayEvent(ctx);
  if (!event || event.kind !== 'riddle') throw new HttpError(404, 'No riddle today');
  if (event.status === 'completed') throw new HttpError(409, 'Riddle already solved');
  if (event.status !== 'active') throw new HttpError(409, 'The riddle has expired');

  const guess = String(payload.guess ?? '').trim().slice(0, 200);
  if (!guess) throw new HttpError(400, 'Speak your answer');

  const { data: secret } = await db
    .from('riddle_answers')
    .select('answer')
    .eq('event_id', event.id)
    .maybeSingle();
  if (!secret) {
    console.error(`riddle_answers row missing for event ${event.id}`);
    throw new HttpError(500, 'The riddle was lost to the void');
  }

  const maxAttempts = Number(event.payload?.max_attempts ?? RIDDLE_MAX_ATTEMPTS);
  const used = Number(event.payload?.attempts_used ?? 0);
  if (used >= maxAttempts) throw new HttpError(409, 'No attempts remain');

  const attempts = used + 1;
  const correct = answerMatches(guess, secret.answer);
  const failed = !correct && attempts >= maxAttempts;
  const { data: updated } = await db
    .from('system_events')
    .update({
      payload: { ...event.payload, attempts_used: attempts },
      ...(correct
        ? { status: 'completed', completed_at: new Date().toISOString() }
        : failed
          ? { status: 'expired' }
          : {}),
    })
    .eq('id', event.id)
    .select('*')
    .single();

  // The canonical answer (first alias) is revealed once the riddle resolves.
  const canonical = secret.answer.split('|')[0];

  if (correct) {
    const award = await awardXp(ctx, event.xp_reward, 'riddle_solved', event.id);
    await db.from('system_messages').insert({
      user_id: userId,
      kind: 'riddle_solved',
      title: 'RIDDLE SOLVED.',
      body: `“${canonical}” — correct. +${event.xp_reward} XP. The System enjoys a worthy mind.`,
      payload: { event_id: event.id },
    });
    return { ok: true, correct: true, answer: canonical, award, event: updated };
  }

  if (failed) {
    await db.from('system_messages').insert({
      user_id: userId,
      kind: 'riddle_failed',
      title: 'The riddle stands unsolved.',
      body: `The answer was “${canonical}”. No XP — but the System will ask again, another day.`,
      payload: { event_id: event.id },
    });
  }
  return {
    ok: true,
    correct: false,
    attempts_left: maxAttempts - attempts,
    answer: failed ? canonical : null,
    event: updated,
  };
}

// ── generate-questions: Archive Scan — AI questions for a tome (Phase 6) ────
// Costs mana like a study session; pays nothing by itself. The questions land
// in the same retention ladder as the Player's own, marked source='system'.
async function generateQuestions(ctx: Ctx, payload: { book_id?: string }) {
  const { db, userId, profile } = ctx;
  const book = await getBook(ctx, payload.book_id);
  if (book.status === 'abandoned') throw new HttpError(409, 'This tome is closed');
  if (book.pages_read <= 0) {
    throw new HttpError(409, 'Read first. The Archive only questions what you have opened.');
  }
  if (!aiAvailable()) {
    throw new HttpError(503, 'The Archive is offline — no AI key is configured.');
  }
  if (profile.mana < MANA_COSTS.study) {
    throw new HttpError(409, 'Insufficient mana. Recover before consulting the Archive.');
  }

  const { data: existing } = await db
    .from('retention_questions')
    .select('prompt')
    .eq('user_id', userId)
    .eq('book_id', book.id);
  const existingPrompts = (existing ?? []).map((q) => String(q.prompt));
  const remaining = MAX_QUESTIONS_PER_BOOK - existingPrompts.length;
  if (remaining <= 0) {
    throw new HttpError(409, 'Question bank full for this tome — master what you have.');
  }

  const { data: sessions } = await db
    .from('reading_sessions')
    .select('reflection')
    .eq('user_id', userId)
    .eq('book_id', book.id)
    .neq('reflection', '')
    .order('local_date', { ascending: false })
    .limit(5);

  const generated = await generateBookQuestions({
    title: book.title,
    author: book.author,
    reflections: (sessions ?? []).map((s) => String(s.reflection)),
    existingPrompts,
    count: Math.min(ARCHIVE_SCAN_QUESTIONS, remaining),
  });
  if (!generated) {
    throw new HttpError(502, 'The Archive did not answer. Try again shortly.');
  }

  const { data: questions, error } = await db
    .from('retention_questions')
    .insert(
      generated.map((q) => ({
        user_id: userId,
        book_id: book.id,
        prompt: q.prompt,
        answer: q.answer,
        source: 'system',
        due_date: initialDueDate(ctx.today),
      })),
    )
    .select('*');
  if (error || !questions) throw new HttpError(500, 'Failed to bank generated questions');

  // Mana is only spent on success — a silent Archive costs nothing.
  const mana = clampMana(profile.mana - MANA_COSTS.study, profile.mana_max);
  await db.from('profiles').update({ mana }).eq('user_id', userId);
  profile.mana = mana;

  return {
    ok: true,
    questions,
    mana,
    bank_remaining: remaining - questions.length,
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
  // Class discipline and passive skills amplify XP for matching sources before the cap.
  const xpMult =
    classXpMultiplier(ctx.profile.class, source) *
    skillXpMultiplier(ctx.skillKeys, source) *
    shadowXpMultiplier(ctx.deployedShadows, source);
  const effectiveAmount = Math.round(amount * xpMult);
  const { data: award, error } = await ctx.db.rpc('award_xp', {
    p_user: ctx.userId,
    p_amount: effectiveAmount,
    p_source: source,
    p_source_ref: sourceRef,
    p_cap_eligible: capEligible,
    p_local_date: ctx.today,
  });
  if (error) {
    console.error('award_xp failed:', error);
    throw new HttpError(500, 'XP award failed');
  }

  // Effort trains attributes regardless of the daily XP cap — the act happened.
  const baseGains = statGainsFor(source);
  if (Object.keys(baseGains).length > 0) {
    const statMult = skillStatMultiplier(ctx.skillKeys) * shadowStatMultiplier(ctx.deployedShadows);
    const gains =
      statMult === 1
        ? baseGains
        : Object.fromEntries(
            Object.entries(baseGains).map(([k, v]) => [k, Math.round(v * statMult * 100) / 100]),
          );
    const { error: statErr } = await ctx.db.rpc('increment_stats', {
      p_user: ctx.userId,
      p_gains: gains,
    });
    if (statErr) console.error('increment_stats failed:', statErr);
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

    // A level-up may cross a rank threshold — promote and pay Essence Stones.
    const newRank = rankForLevel(award.new_level);
    if (newRank !== ctx.profile.rank) {
      await ctx.db.from('profiles').update({ rank: newRank }).eq('user_id', ctx.userId);
      // essence_stones is server-authoritative; add without a read-modify-write.
      await ctx.db.rpc('grant_essence', { p_user: ctx.userId, p_amount: RANK_UP_ESSENCE });
      ctx.profile.rank = newRank;
      await ctx.db.from('system_messages').insert({
        user_id: ctx.userId,
        kind: 'rank_up',
        title: `RANK UP — You are now ${newRank}-Rank.`,
        body: `The System reclassifies you as a ${RANK_TITLES[newRank]}. +${RANK_UP_ESSENCE} Essence Stones. Power recognized is power earned.`,
        payload: { rank: newRank },
      });
    }
  }

  // Any award may push a tracked metric over a title threshold.
  await checkTitles(ctx);
  return award;
}

// ── Titles: sweep tracked metrics, grant any newly earned (Phase 7) ─────────
async function checkTitles(ctx: Ctx): Promise<string[]> {
  const { db, userId } = ctx;
  const [totals, dungeon, booksRes, masteredRes, perfectRes, riddlesRes, earnedRes] =
    await Promise.all([
      db.from('training_totals').select('*').eq('user_id', userId).maybeSingle(),
      db.from('dungeon_progress').select('cycles_cleared').eq('user_id', userId).maybeSingle(),
      db
        .from('books')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'finished'),
      db
        .from('retention_questions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('mastered', true),
      db
        .from('training_quests')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('perfect_clear', true),
      db
        .from('xp_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('source', 'riddle_solved'),
      db.from('titles').select('title_key').eq('user_id', userId),
    ]);

  const state: TitleState = {
    level: ctx.profile.level,
    rankIndex: Math.max(0, RANKS.indexOf(ctx.profile.rank as (typeof RANKS)[number])),
    bestStreak: totals.data?.best_streak ?? 0,
    daysCompleted: totals.data?.days_completed ?? 0,
    totalReps:
      Number(totals.data?.total_pushups ?? 0) +
      Number(totals.data?.total_situps ?? 0) +
      Number(totals.data?.total_squats ?? 0),
    totalRunKm: Number(totals.data?.total_run_km ?? 0),
    booksFinished: booksRes.count ?? 0,
    questionsMastered: masteredRes.count ?? 0,
    dungeonCycles: dungeon.data?.cycles_cleared ?? 0,
    perfectClears: perfectRes.count ?? 0,
    riddlesSolved: riddlesRes.count ?? 0,
  };

  const earned = new Set((earnedRes.data ?? []).map((r) => r.title_key as string));
  const newly = evaluateTitles(state).filter((key) => !earned.has(key));
  if (newly.length === 0) return [];

  await db.from('titles').insert(newly.map((title_key) => ({ user_id: userId, title_key })));
  for (const key of newly) {
    const def = titleDef(key);
    if (!def) continue;
    if (def.essence > 0) await db.rpc('grant_essence', { p_user: userId, p_amount: def.essence });
    await db.from('system_messages').insert({
      user_id: userId,
      kind: 'title_earned',
      title: `TITLE EARNED — “${def.name}”.`,
      body: `${def.description}. +${def.essence} Essence Stones. Equip it from your Status to wear it.`,
      payload: { title_key: key },
    });
  }
  return newly;
}

// ── equip-title: wear an earned title (empty key clears it) ──────────────────
async function equipTitle(ctx: Ctx, payload: { title_key?: string }) {
  const key = typeof payload.title_key === 'string' ? payload.title_key.trim() : '';

  if (!key) {
    await ctx.db.from('profiles').update({ equipped_title: null }).eq('user_id', ctx.userId);
    return { ok: true, equipped_title: null };
  }

  const def = titleDef(key);
  if (!def) throw new HttpError(404, 'No such title');
  const { data: owned } = await ctx.db
    .from('titles')
    .select('title_key')
    .eq('user_id', ctx.userId)
    .eq('title_key', key)
    .maybeSingle();
  if (!owned) throw new HttpError(409, 'You have not earned that title');

  await ctx.db.from('profiles').update({ equipped_title: def.name }).eq('user_id', ctx.userId);
  return { ok: true, equipped_title: def.name };
}

// ── choose-class: the job change — one-time, gated by rank + dominant stats ──
async function chooseClass(ctx: Ctx, payload: { class_key?: string }) {
  const { db, userId, profile } = ctx;
  if (profile.class) throw new HttpError(409, 'Your class is already set');
  if (RANKS.indexOf(profile.rank as (typeof RANKS)[number]) < RANKS.indexOf(JOB_CHANGE_RANK)) {
    throw new HttpError(409, `The job change unlocks at ${JOB_CHANGE_RANK}-Rank`);
  }

  const key = typeof payload.class_key === 'string' ? payload.class_key.trim() : '';
  const def = classDef(key);
  if (!def) throw new HttpError(404, 'No such class');

  const { data: statRows } = await db.from('stats').select('stat, value').eq('user_id', userId);
  const stats = Object.fromEntries((statRows ?? []).map((r) => [r.stat, Number(r.value)]));
  if (!eligibleClasses(stats).some((c) => c.key === def.key)) {
    throw new HttpError(409, 'Your attributes do not qualify you for that class');
  }

  await db.from('profiles').update({ class: def.key }).eq('user_id', userId);
  profile.class = def.key;
  await db.from('system_messages').insert({
    user_id: userId,
    kind: 'class_awakened',
    title: `CLASS AWAKENED — ${def.name}.`,
    body: `${def.perk}. The path you walk is now your own.`,
    payload: { class_key: def.key },
  });

  return { ok: true, class: def.key };
}

// ── unlock-skill: spend Essence to learn a passive or active ability ────────
async function unlockSkill(ctx: Ctx, payload: { skill_key?: string }) {
  const { db, userId, profile } = ctx;
  const key = typeof payload.skill_key === 'string' ? payload.skill_key.trim() : '';
  const def = skillDef(key);
  if (!def) throw new HttpError(404, 'No such skill');
  if (ctx.skillKeys.includes(key)) throw new HttpError(409, 'Skill already learned');

  const rankIndex = Math.max(0, RANKS.indexOf(profile.rank as (typeof RANKS)[number]));
  const locked = skillPrereqError(def, { level: profile.level, rankIndex });
  if (locked) throw new HttpError(409, locked);
  if (profile.essence_stones < def.essenceCost) {
    throw new HttpError(409, `Not enough Essence — ${def.essenceCost} required`);
  }

  const { error: insErr } = await db.from('skills').insert({ user_id: userId, skill_key: key });
  if (insErr) {
    if (insErr.code === '23505') throw new HttpError(409, 'Skill already learned');
    console.error('skills insert failed:', insErr);
    throw new HttpError(500, 'Failed to learn skill');
  }

  const essence = profile.essence_stones - def.essenceCost;
  await db.from('profiles').update({ essence_stones: essence }).eq('user_id', userId);
  profile.essence_stones = essence;
  ctx.skills.push({ skill_key: key, last_used_at: null });
  ctx.skillKeys.push(key);

  await db.from('system_messages').insert({
    user_id: userId,
    kind: 'skill_unlocked',
    title: `SKILL LEARNED — ${def.name}.`,
    body: `${def.description}. −${def.essenceCost} Essence Stones.`,
    payload: { skill_key: key },
  });

  return { ok: true, skill: key, essence };
}

// ── use-skill: trigger an active ability (cooldown + mana gated) ─────────────
async function useSkill(ctx: Ctx, payload: { skill_key?: string }) {
  const { db, userId, profile, today } = ctx;
  const key = typeof payload.skill_key === 'string' ? payload.skill_key.trim() : '';
  const def = skillDef(key);
  if (!def) throw new HttpError(404, 'No such skill');
  if (def.type !== 'active') throw new HttpError(409, 'That skill is passive — it is always on');

  const row = ctx.skills.find((s) => s.skill_key === key);
  if (!row) throw new HttpError(409, 'You have not learned that skill');

  const remaining = skillCooldownRemaining(row.last_used_at, def.cooldownDays ?? 0, today);
  if (remaining > 0) {
    throw new HttpError(409, `On cooldown — ${remaining} day${remaining === 1 ? '' : 's'} left`);
  }

  const manaCost = def.manaCost ?? 0;
  if (manaCost > 0 && profile.mana < manaCost) {
    throw new HttpError(409, 'Insufficient mana for this skill');
  }

  const update: Record<string, number> = {};
  let result: Record<string, unknown> = {};
  switch (def.effect) {
    case 'restore_mana': {
      update.mana = profile.mana_max;
      result = { mana: update.mana, restored: update.mana - profile.mana };
      break;
    }
    case 'purge_fatigue': {
      update.fatigue = 0;
      result = { fatigue: 0 };
      break;
    }
    case 'craft_potion': {
      update.mana = clampMana(profile.mana - manaCost, profile.mana_max);
      update.mana_potions = profile.mana_potions + 1;
      result = { mana: update.mana, potions: update.mana_potions };
      break;
    }
    default:
      throw new HttpError(500, 'Skill has no effect');
  }

  await db.from('profiles').update(update).eq('user_id', userId);
  if (update.mana !== undefined) profile.mana = update.mana;
  if (update.fatigue !== undefined) profile.fatigue = update.fatigue;
  if (update.mana_potions !== undefined) profile.mana_potions = update.mana_potions;

  await db.from('skills').update({ last_used_at: today }).eq('user_id', userId).eq('skill_key', key);
  row.last_used_at = today;

  return { ok: true, skill: key, cooldown_days: def.cooldownDays ?? 0, ...result };
}

// ── Legacy Boss (Phase 8): snapshot, arm, and surpass your past self ─────────
type LegacyRow = {
  id: string;
  taken_on: string;
  due_date: string;
  metrics: LegacyMetrics;
  status: string;
  defeated_on: string | null;
  last_attempt: string | null;
};

/** Best logged top-set weight for any exercise whose name matches `pattern`. */
async function bestLift(ctx: Ctx, pattern: string): Promise<number> {
  const { data } = await ctx.db
    .from('lift_logs')
    .select('weight_kg')
    .eq('user_id', ctx.userId)
    .ilike('exercise', pattern)
    .order('weight_kg', { ascending: false })
    .limit(1);
  return Number(data?.[0]?.weight_kg ?? 0);
}

/** Capture the Player's present measurable self for a Legacy snapshot. */
async function captureLegacyMetrics(ctx: Ctx): Promise<LegacyMetrics> {
  const [statsRes, totals, books, bench, squat, deadlift] = await Promise.all([
    ctx.db.from('stats').select('value').eq('user_id', ctx.userId),
    ctx.db.from('training_totals').select('*').eq('user_id', ctx.userId).maybeSingle(),
    ctx.db
      .from('books')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.userId)
      .eq('status', 'finished'),
    bestLift(ctx, '%bench%'),
    bestLift(ctx, '%squat%'),
    bestLift(ctx, '%deadlift%'),
  ]);

  const totalStats = (statsRes.data ?? []).reduce((sum, r) => sum + Number(r.value), 0);
  const t = totals.data;
  return {
    level: ctx.profile.level,
    totalStats: Math.round(totalStats * 100) / 100,
    benchKg: bench,
    squatKg: squat,
    deadliftKg: deadlift,
    totalReps:
      Number(t?.total_pushups ?? 0) + Number(t?.total_situps ?? 0) + Number(t?.total_squats ?? 0),
    totalRunKm: Number(t?.total_run_km ?? 0),
    bestStreak: Number(t?.best_streak ?? 0),
    booksFinished: books.count ?? 0,
  };
}

async function getArmedLegacy(ctx: Ctx): Promise<LegacyRow | null> {
  const { data } = await ctx.db
    .from('legacy_snapshots')
    .select('id, taken_on, due_date, metrics, status, defeated_on, last_attempt')
    .eq('user_id', ctx.userId)
    .eq('status', 'armed')
    .maybeSingle();
  return (data as LegacyRow) ?? null;
}

/** Seed the first snapshot if none exists; announce one that has come due. */
async function ensureLegacy(ctx: Ctx): Promise<void> {
  const { db, userId, today } = ctx;
  const armed = await getArmedLegacy(ctx);

  if (!armed) {
    const metrics = await captureLegacyMetrics(ctx);
    await db.from('legacy_snapshots').insert({
      user_id: userId,
      taken_on: today,
      due_date: addDays(today, LEGACY_HORIZON_DAYS),
      metrics,
    });
    return;
  }

  // Surface a due boss once per day (keyed on last_attempt being unset today).
  if (armed.due_date <= today && armed.last_attempt !== today) {
    const { data: recent } = await db
      .from('system_messages')
      .select('id')
      .eq('user_id', userId)
      .eq('kind', 'legacy_ready')
      .gte('created_at', `${today}T00:00:00Z`)
      .limit(1);
    if (!recent || recent.length === 0) {
      await db.from('system_messages').insert({
        user_id: userId,
        kind: 'legacy_ready',
        title: 'YOUR PAST SELF HAS RISEN.',
        body: 'Ninety days ago the System recorded who you were. That self now stands as a boss. Face it from the Dungeons — surpass who you were.',
        payload: { legacy_id: armed.id },
      });
    }
  }
}

// ── challenge-legacy: fight your past self; surpass it to clear the boss ─────
async function challengeLegacy(ctx: Ctx) {
  const { db, userId, today } = ctx;
  const armed = await getArmedLegacy(ctx);
  if (!armed) throw new HttpError(404, 'No Legacy Boss is armed');
  if (armed.due_date > today) {
    throw new HttpError(409, 'Your past self has not yet risen — the snapshot is still maturing');
  }
  if (armed.last_attempt === today) {
    throw new HttpError(409, 'One challenge per day. Train, recover, and return tomorrow.');
  }

  const current = await captureLegacyMetrics(ctx);
  const verdict = compareLegacy(armed.metrics, current);

  if (!verdict.victory) {
    await db
      .from('legacy_snapshots')
      .update({ last_attempt: today })
      .eq('id', armed.id);
    await db.from('system_messages').insert({
      user_id: userId,
      kind: 'legacy_failed',
      title: 'Your past self stands unbeaten.',
      body: `You matched ${verdict.coreBeaten}/${verdict.coreRequired} of the measures that matter. Close the gaps and challenge again tomorrow.`,
      payload: { legacy_id: armed.id },
    });
    return { ok: true, victory: false, verdict, snapshot: armed };
  }

  // Victory — clear the boss, reward, and arm the next 90-day snapshot.
  const reward = legacyReward(verdict);
  await db
    .from('legacy_snapshots')
    .update({ status: 'defeated', defeated_on: today, last_attempt: today })
    .eq('id', armed.id);

  const award = await awardXp(ctx, reward.xp, 'legacy_clear', armed.id, false);
  if (reward.essence > 0) await db.rpc('grant_essence', { p_user: userId, p_amount: reward.essence });

  // The Self-Overcome title is granted by this event, not the metric sweep.
  await db.from('titles').upsert(
    { user_id: userId, title_key: 'self_overcome' },
    { onConflict: 'user_id,title_key', ignoreDuplicates: true },
  );

  // Your vanquished past self becomes the army's strongest shadow (Phase 9).
  await dropShadow(ctx, 'legacy', armed.id, 'Your Past Self', 'Monarch');

  await db.from('legacy_snapshots').insert({
    user_id: userId,
    taken_on: today,
    due_date: addDays(today, LEGACY_HORIZON_DAYS),
    metrics: current,
  });

  await db.from('system_messages').insert({
    user_id: userId,
    kind: 'legacy_cleared',
    title: 'YOU HAVE SURPASSED YOUR PAST SELF.',
    body: `Every measure that mattered, beaten. +${reward.xp} XP, +${reward.essence} Essence. A new snapshot is sealed — in 90 days, today's self becomes the boss.`,
    payload: { legacy_id: armed.id },
  });

  return { ok: true, victory: true, verdict, award, reward };
}

// ── Shadow Army (Phase 9): Arise, deploy, recall ────────────────────────────
// A cleared conquest drops an `available` shadow. Idempotent per conquest via
// the unique (user_id, source_type, source_ref) constraint, so re-runs no-op.
async function dropShadow(
  ctx: Ctx,
  sourceType: ShadowSource,
  sourceRef: string,
  name: string,
  grade: ShadowGrade,
) {
  const { error } = await ctx.db.from('shadows').insert({
    user_id: ctx.userId,
    source_type: sourceType,
    source_ref: sourceRef,
    name,
    grade,
  });
  if (error) {
    if (error.code === '23505') return; // already dropped for this conquest
    console.error('shadow drop failed:', error);
    return;
  }
  await ctx.db.from('system_messages').insert({
    user_id: ctx.userId,
    kind: 'shadow_available',
    title: `A shadow lingers — ${name}.`,
    body: 'The fallen can be raised. Visit the Shadow Army and ARISE — if your will is strong enough to bind it.',
    payload: { source_type: sourceType, source_ref: sourceRef },
  });
}

async function getShadow(ctx: Ctx, shadowId: unknown) {
  const id = typeof shadowId === 'string' ? shadowId : '';
  if (!id) throw new HttpError(400, 'shadow_id required');
  const { data } = await ctx.db
    .from('shadows')
    .select('*')
    .eq('user_id', ctx.userId)
    .eq('id', id)
    .maybeSingle();
  if (!data) throw new HttpError(404, 'No such shadow');
  return data;
}

// ── extract-shadow: spend mana, roll the Arise; failure keeps the conquest ──
async function extractShadow(ctx: Ctx, payload: { shadow_id?: string }) {
  const { db, userId, profile } = ctx;
  const shadow = await getShadow(ctx, payload.shadow_id);
  if (shadow.status !== 'available') throw new HttpError(409, 'That shadow is already arisen');
  if (profile.mana < SHADOW_EXTRACT_MANA) {
    throw new HttpError(409, 'Insufficient mana to attempt extraction');
  }

  // Mana is spent on every attempt; the conquest survives a failed Arise.
  const mana = clampMana(profile.mana - SHADOW_EXTRACT_MANA, profile.mana_max);
  await db.from('profiles').update({ mana }).eq('user_id', userId);
  profile.mana = mana;

  const chance = extractChance(shadow.grade as ShadowGrade, profile.rank);
  const success = Math.random() < chance;

  if (!success) {
    await db.from('system_messages').insert({
      user_id: userId,
      kind: 'shadow_failed',
      title: `${shadow.name} resists.`,
      body: `The extraction failed — ${SHADOW_EXTRACT_MANA} mana spent. The shadow lingers; gather your strength and command it to ARISE again.`,
      payload: { shadow_id: shadow.id },
    });
    return { ok: true, success: false, chance, mana, shadow };
  }

  const { data: arisen } = await db
    .from('shadows')
    .update({ status: 'arisen', arisen_at: new Date().toISOString() })
    .eq('id', shadow.id)
    .select('*')
    .single();
  await db.from('system_messages').insert({
    user_id: userId,
    kind: 'shadow_arisen',
    title: `ARISE — ${shadow.name} answers.`,
    body: `A ${shadow.grade} shadow joins your army. Deploy it from the Shadow Army to wield its power.`,
    payload: { shadow_id: shadow.id },
  });
  return { ok: true, success: true, chance, mana, shadow: arisen ?? shadow };
}

// ── deploy/recall-shadow: manage the active set within army capacity ─────────
async function setShadowDeployed(ctx: Ctx, payload: { shadow_id?: string }, deployed: boolean) {
  const { db, userId, profile } = ctx;
  const shadow = await getShadow(ctx, payload.shadow_id);
  if (shadow.status !== 'arisen') throw new HttpError(409, 'Only arisen shadows can be deployed');

  if (deployed) {
    if (shadow.deployed) return { ok: true, shadow };
    const { count } = await db
      .from('shadows')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('deployed', true);
    if ((count ?? 0) >= armyCapacity(profile.rank)) {
      throw new HttpError(409, `Army at capacity (${armyCapacity(profile.rank)}). Recall a shadow first.`);
    }
  }

  const { data: updated } = await db
    .from('shadows')
    .update({ deployed })
    .eq('id', shadow.id)
    .select('*')
    .single();
  return { ok: true, shadow: updated ?? { ...shadow, deployed } };
}
