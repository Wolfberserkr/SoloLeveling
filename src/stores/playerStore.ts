import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { gameAction } from '@/lib/gameApi';
import { EXPLORES_PER_DAY } from '@game/encounters.ts';
import type {
  Profile,
  StatRow,
  Title,
  Skill,
  Shadow,
  LegacySnapshot,
  TrainingQuest,
  TrainingTotals,
  PenaltyQuest,
  DailyQuest,
  SleepLog,
  NutritionLog,
  DungeonProgress,
  BodyMetrics,
  Book,
  RetentionQuestion,
  SystemEvent,
  LiftLog,
  SystemMessage,
  Encounter,
  InventoryItem,
  EquippedItem,
  WeeklyReview,
} from '@/lib/types';

type PlayerState = {
  loading: boolean;
  error: string | null;
  /** True when ensure-daily failed and we're rendering direct table reads. */
  degraded: boolean;
  /** Server-confirmed local date of the last successful ensure-daily. */
  serverToday: string | null;
  /** Epoch ms of the last successful loadAll, for foreground re-sync. */
  lastLoadAt: number | null;
  profile: Profile | null;
  stats: StatRow[];
  titles: Title[];
  skills: Skill[];
  shadows: Shadow[];
  training: TrainingQuest | null;
  penalty: PenaltyQuest | null; // today's Penalty Quest, if the streak broke
  quests: DailyQuest[];
  sleep: SleepLog | null; // today's log, if any
  nutrition: NutritionLog | null; // today's Fuel Protocol log, if any
  dungeon: DungeonProgress | null;
  gymDoneToday: boolean;
  legacy: LegacySnapshot | null; // the armed Legacy Boss, if any
  metrics: BodyMetrics | null; // latest entry
  books: Book[];
  dueQuestions: RetentionQuestion[]; // unmastered checks due today or earlier
  readTodayBookIds: string[]; // tomes with a reading session logged today
  appliedTodayBookIds: string[]; // tomes with an applied insight logged today
  event: SystemEvent | null; // today's System Event, if one spawned
  liftLogs: LiftLog[]; // recent top-set logs, newest first
  totals: TrainingTotals | null;
  messages: SystemMessage[];
  inventory: InventoryItem[];
  equipment: EquippedItem[]; // active gear only
  encounter: Encounter | null; // the active encounter, if any
  exploresLeftToday: number;
  weeklyReview: WeeklyReview | null; // most recent AI System Coach assessment
  // Lifetime tallies feeding the milestone tracker (cheap HEAD counts).
  masteredCount: number;
  perfectClearCount: number;
  riddlesSolvedCount: number;
  /** Full refresh: lazy daily reset on the server, then re-read everything. */
  loadAll: () => Promise<void>;
  /** Re-read DB state without re-running the daily reset. */
  refresh: () => Promise<void>;
  setTraining: (q: TrainingQuest) => void;
  setPenalty: (p: PenaltyQuest | null) => void;
  setQuest: (q: DailyQuest) => void;
  setNutrition: (n: NutritionLog) => void;
  setDungeon: (d: DungeonProgress, gymDoneToday?: boolean) => void;
  /** Fold an XP award into the profile without a full refetch. */
  applyAward: (award: { xp_total?: number; new_level?: number } | null | undefined) => void;
  setMana: (mana: number) => void;
  setStreak: (streak: number) => void;
  reset: () => void;
};

// Monotonic token: a slow, older readState must never clobber the results of
// a newer one that raced past it.
let loadSeq = 0;

export const usePlayerStore = create<PlayerState>((set) => ({
  loading: true,
  error: null,
  degraded: false,
  serverToday: null,
  lastLoadAt: null,
  profile: null,
  stats: [],
  titles: [],
  skills: [],
  shadows: [],
  training: null,
  penalty: null,
  quests: [],
  sleep: null,
  nutrition: null,
  dungeon: null,
  gymDoneToday: false,
  legacy: null,
  metrics: null,
  books: [],
  dueQuestions: [],
  readTodayBookIds: [],
  appliedTodayBookIds: [],
  event: null,
  liftLogs: [],
  totals: null,
  messages: [],
  inventory: [],
  equipment: [],
  encounter: null,
  exploresLeftToday: EXPLORES_PER_DAY,
  weeklyReview: null,
  masteredCount: 0,
  perfectClearCount: 0,
  riddlesSolvedCount: 0,

  loadAll: async () => {
    const seq = ++loadSeq;
    const guarded: typeof set = (partial) => {
      if (seq === loadSeq) set(partial);
    };
    set({ loading: true, error: null });
    try {
      // The System catches up on the day (generates today's quests) first.
      const daily = await gameAction<{
        today: string;
        training: TrainingQuest;
        quests: DailyQuest[];
        dungeon: DungeonProgress;
        gym_done_today: boolean;
        penalty: PenaltyQuest | null;
      }>('ensure-daily');
      await readState(guarded);
      guarded({
        training: daily.training,
        quests: daily.quests,
        dungeon: daily.dungeon,
        gymDoneToday: daily.gym_done_today,
        penalty: daily.penalty ?? null,
        serverToday: daily.today ?? null,
        lastLoadAt: Date.now(),
        loading: false,
      });
    } catch (err) {
      // The edge function is down or unreachable — most state is still
      // readable straight from the tables (RLS allows SELECT). Render that
      // instead of bricking the boot; actions will surface their own errors.
      try {
        await readState(guarded);
        guarded({ degraded: true, lastLoadAt: Date.now(), loading: false });
      } catch {
        guarded({
          error: err instanceof Error ? err.message : 'System link failed',
          loading: false,
        });
      }
    }
  },

  refresh: async () => {
    const seq = ++loadSeq;
    const guarded: typeof set = (partial) => {
      if (seq === loadSeq) set(partial);
    };
    try {
      await readState(guarded);
    } catch (err) {
      guarded({ error: err instanceof Error ? err.message : 'System link failed' });
    }
  },

  setTraining: (q) => set({ training: q }),

  setPenalty: (p) => set({ penalty: p }),

  setQuest: (q) =>
    set((s) => ({ quests: s.quests.map((existing) => (existing.id === q.id ? q : existing)) })),

  setNutrition: (n) => set({ nutrition: n }),

  setDungeon: (d, gymDoneToday) =>
    set((s) => ({ dungeon: d, gymDoneToday: gymDoneToday ?? s.gymDoneToday })),

  applyAward: (award) =>
    set((s) => {
      if (!award || !s.profile) return {};
      return {
        profile: {
          ...s.profile,
          xp_total: award.xp_total ?? s.profile.xp_total,
          level: award.new_level ?? s.profile.level,
        },
      };
    }),

  setMana: (mana) => set((s) => (s.profile ? { profile: { ...s.profile, mana } } : {})),

  setStreak: (streak) =>
    set((s) =>
      s.totals
        ? {
            totals: {
              ...s.totals,
              current_streak: streak,
              best_streak: Math.max(Number(s.totals.best_streak ?? 0), streak),
            },
          }
        : {},
    ),

  reset: () =>
    set({
      loading: true,
      error: null,
      degraded: false,
      serverToday: null,
      lastLoadAt: null,
      profile: null,
      stats: [],
      titles: [],
      skills: [],
      shadows: [],
      training: null,
      penalty: null,
      quests: [],
      sleep: null,
      nutrition: null,
      dungeon: null,
      gymDoneToday: false,
      legacy: null,
      metrics: null,
      books: [],
      dueQuestions: [],
      readTodayBookIds: [],
      appliedTodayBookIds: [],
      event: null,
      liftLogs: [],
      totals: null,
      messages: [],
      inventory: [],
      equipment: [],
      encounter: null,
      exploresLeftToday: EXPLORES_PER_DAY,
      weeklyReview: null,
      masteredCount: 0,
      perfectClearCount: 0,
      riddlesSolvedCount: 0,
    }),
}));

async function readState(set: (partial: Partial<PlayerState>) => void) {
  const [
    profileRes,
    statsRes,
    titlesRes,
    skillsRes,
    totalsRes,
    messagesRes,
    trainingRes,
    questsRes,
    sleepRes,
    nutritionRes,
    dungeonRes,
    gymRes,
    metricsRes,
    booksRes,
    questionsRes,
    readingRes,
    applicationsRes,
    eventRes,
    liftsRes,
    legacyRes,
    shadowsRes,
    inventoryRes,
    equipmentRes,
    encounterRes,
    weeklyReviewRes,
    masteredRes,
    perfectRes,
    riddlesRes,
    penaltyRes,
  ] = await Promise.all([
      supabase.from('profiles').select('*').single(),
      supabase.from('stats').select('*'),
      supabase.from('titles').select('*').order('earned_at'),
      supabase.from('skills').select('*').order('unlocked_at'),
      supabase.from('training_totals').select('*').single(),
      supabase
        .from('system_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('training_quests')
        .select('*')
        .order('local_date', { ascending: false })
        .limit(1),
      supabase
        .from('daily_quests')
        .select('*')
        .order('local_date', { ascending: false })
        .order('quest_key')
        .limit(10),
      supabase
        .from('sleep_logs')
        .select('*')
        .order('local_date', { ascending: false })
        .limit(1),
      supabase
        .from('nutrition_logs')
        .select('*')
        .order('local_date', { ascending: false })
        .limit(1),
      supabase.from('dungeon_progress').select('*').maybeSingle(),
      supabase
        .from('gym_sessions')
        .select('local_date')
        .order('local_date', { ascending: false })
        .limit(1),
      supabase
        .from('body_metrics')
        .select('*')
        .order('local_date', { ascending: false })
        .limit(1),
      supabase.from('books').select('*').order('created_at'),
      supabase
        .from('retention_questions')
        .select('*')
        .eq('mastered', false)
        .order('due_date')
        .limit(100),
      supabase
        .from('reading_sessions')
        .select('book_id, local_date')
        .order('local_date', { ascending: false })
        .limit(20),
      supabase
        .from('book_applications')
        .select('book_id, local_date')
        .order('local_date', { ascending: false })
        .limit(20),
      supabase
        .from('system_events')
        .select('*')
        .order('local_date', { ascending: false })
        .limit(1),
      supabase
        .from('lift_logs')
        .select('*')
        .order('local_date', { ascending: false })
        .limit(300),
      supabase
        .from('legacy_snapshots')
        .select('*')
        .eq('status', 'armed')
        .order('due_date')
        .limit(1),
      supabase.from('shadows').select('*').order('created_at'),
      supabase.from('inventory').select('*').gt('quantity', 0).order('item_key'),
      supabase.from('equipment').select('*').eq('active', true).order('expires_at'),
      supabase.from('encounters').select('*').eq('status', 'active').maybeSingle(),
      supabase
        .from('weekly_reviews')
        .select('*')
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('retention_questions')
        .select('id', { count: 'exact', head: true })
        .eq('mastered', true),
      supabase
        .from('training_quests')
        .select('id', { count: 'exact', head: true })
        .eq('perfect_clear', true),
      supabase
        .from('xp_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('source', 'riddle_solved'),
      supabase
        .from('penalty_quests')
        .select('*')
        .order('local_date', { ascending: false })
        .limit(1),
    ]);

  if (profileRes.error) throw new Error(profileRes.error.message);

  // A failed slice must not masquerade as an empty state ("no training quest
  // found") — count failures and let the degraded banner tell the truth.
  const sliceErrors = [
    statsRes, titlesRes, skillsRes, totalsRes, messagesRes, trainingRes, questsRes,
    sleepRes, nutritionRes, dungeonRes, gymRes, metricsRes, booksRes, questionsRes,
    readingRes, applicationsRes, eventRes, liftsRes, legacyRes, shadowsRes,
    inventoryRes, equipmentRes, encounterRes, weeklyReviewRes,
  ].filter((r) => r.error != null).length;
  if (sliceErrors > 0) console.error(`readState: ${sliceErrors} slice reads failed`);

  const training = ((trainingRes.data ?? [])[0] ?? null) as TrainingQuest | null;
  const today = training?.local_date;
  const quests = ((questsRes.data ?? []) as DailyQuest[]).filter((q) => q.local_date === today);
  const sleepRow = ((sleepRes.data ?? [])[0] ?? null) as SleepLog | null;
  const nutritionRow = ((nutritionRes.data ?? [])[0] ?? null) as NutritionLog | null;
  const gymRow = (gymRes.data ?? [])[0] ?? null;
  const eventRow = ((eventRes.data ?? [])[0] ?? null) as SystemEvent | null;
  // penalty_quests may not be migrated yet; a read error just means "none".
  const penaltyRow = penaltyRes.error
    ? null
    : ((penaltyRes.data ?? [])[0] ?? null) as PenaltyQuest | null;
  const dueQuestions = ((questionsRes.data ?? []) as RetentionQuestion[]).filter(
    (q) => q.due_date != null && today != null && q.due_date <= today,
  );
  const todaysBookIds = (rows: Array<{ book_id: string; local_date: string }> | null) =>
    (rows ?? []).filter((r) => r.local_date === today).map((r) => r.book_id);

  set({
    degraded: sliceErrors > 0,
    profile: profileRes.data as Profile,
    stats: (statsRes.data ?? []) as StatRow[],
    titles: (titlesRes.data ?? []) as Title[],
    skills: (skillsRes.data ?? []) as Skill[],
    totals: (totalsRes.data ?? null) as TrainingTotals | null,
    messages: (messagesRes.data ?? []) as SystemMessage[],
    training,
    penalty: penaltyRow && penaltyRow.local_date === today ? penaltyRow : null,
    quests,
    sleep: sleepRow && sleepRow.local_date === today ? sleepRow : null,
    nutrition: nutritionRow && nutritionRow.local_date === today ? nutritionRow : null,
    dungeon: (dungeonRes.data ?? null) as DungeonProgress | null,
    gymDoneToday: Boolean(gymRow && gymRow.local_date === today),
    metrics: ((metricsRes.data ?? [])[0] ?? null) as BodyMetrics | null,
    books: (booksRes.data ?? []) as Book[],
    dueQuestions,
    readTodayBookIds: todaysBookIds(readingRes.data),
    appliedTodayBookIds: todaysBookIds(applicationsRes.data),
    event: eventRow && eventRow.local_date === today ? eventRow : null,
    liftLogs: (liftsRes.data ?? []) as LiftLog[],
    legacy: ((legacyRes.data ?? [])[0] ?? null) as LegacySnapshot | null,
    shadows: (shadowsRes.data ?? []) as Shadow[],
    inventory: (inventoryRes.data ?? []) as InventoryItem[],
    equipment: (equipmentRes.data ?? []) as EquippedItem[],
    encounter: (encounterRes.data ?? null) as Encounter | null,
    weeklyReview: (weeklyReviewRes.data ?? null) as WeeklyReview | null,
    masteredCount: masteredRes.count ?? 0,
    perfectClearCount: perfectRes.count ?? 0,
    riddlesSolvedCount: riddlesRes.count ?? 0,
    exploresLeftToday: Math.max(
      0,
      EXPLORES_PER_DAY - Number((profileRes.data as Profile).explores_today ?? 0),
    ),
  });
}
