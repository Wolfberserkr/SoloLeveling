import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { gameAction } from '@/lib/gameApi';
import type {
  Profile,
  StatRow,
  TrainingQuest,
  TrainingTotals,
  DailyQuest,
  SleepLog,
  DungeonProgress,
  BodyMetrics,
  Book,
  RetentionQuestion,
  SystemEvent,
  LiftLog,
  SystemMessage,
} from '@/lib/types';

type PlayerState = {
  loading: boolean;
  error: string | null;
  profile: Profile | null;
  stats: StatRow[];
  training: TrainingQuest | null;
  quests: DailyQuest[];
  sleep: SleepLog | null; // today's log, if any
  dungeon: DungeonProgress | null;
  gymDoneToday: boolean;
  metrics: BodyMetrics | null; // latest entry
  books: Book[];
  dueQuestions: RetentionQuestion[]; // unmastered checks due today or earlier
  readTodayBookIds: string[]; // tomes with a reading session logged today
  appliedTodayBookIds: string[]; // tomes with an applied insight logged today
  event: SystemEvent | null; // today's System Event, if one spawned
  liftLogs: LiftLog[]; // recent top-set logs, newest first
  totals: TrainingTotals | null;
  messages: SystemMessage[];
  /** Full refresh: lazy daily reset on the server, then re-read everything. */
  loadAll: () => Promise<void>;
  /** Re-read DB state without re-running the daily reset. */
  refresh: () => Promise<void>;
  setTraining: (q: TrainingQuest) => void;
  setQuest: (q: DailyQuest) => void;
  setDungeon: (d: DungeonProgress, gymDoneToday?: boolean) => void;
  reset: () => void;
};

export const usePlayerStore = create<PlayerState>((set) => ({
  loading: true,
  error: null,
  profile: null,
  stats: [],
  training: null,
  quests: [],
  sleep: null,
  dungeon: null,
  gymDoneToday: false,
  metrics: null,
  books: [],
  dueQuestions: [],
  readTodayBookIds: [],
  appliedTodayBookIds: [],
  event: null,
  liftLogs: [],
  totals: null,
  messages: [],

  loadAll: async () => {
    set({ loading: true, error: null });
    try {
      // The System catches up on the day (generates today's quests) first.
      const daily = await gameAction<{
        training: TrainingQuest;
        quests: DailyQuest[];
        dungeon: DungeonProgress;
        gym_done_today: boolean;
      }>('ensure-daily');
      await readState(set);
      set({
        training: daily.training,
        quests: daily.quests,
        dungeon: daily.dungeon,
        gymDoneToday: daily.gym_done_today,
        loading: false,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'System link failed', loading: false });
    }
  },

  refresh: async () => {
    try {
      await readState(set);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'System link failed' });
    }
  },

  setTraining: (q) => set({ training: q }),

  setQuest: (q) =>
    set((s) => ({ quests: s.quests.map((existing) => (existing.id === q.id ? q : existing)) })),

  setDungeon: (d, gymDoneToday) =>
    set((s) => ({ dungeon: d, gymDoneToday: gymDoneToday ?? s.gymDoneToday })),

  reset: () =>
    set({
      loading: true,
      error: null,
      profile: null,
      stats: [],
      training: null,
      quests: [],
      sleep: null,
      dungeon: null,
      gymDoneToday: false,
      metrics: null,
      books: [],
      dueQuestions: [],
      readTodayBookIds: [],
      appliedTodayBookIds: [],
      event: null,
      liftLogs: [],
      totals: null,
      messages: [],
    }),
}));

async function readState(set: (partial: Partial<PlayerState>) => void) {
  const [
    profileRes,
    statsRes,
    totalsRes,
    messagesRes,
    trainingRes,
    questsRes,
    sleepRes,
    dungeonRes,
    gymRes,
    metricsRes,
    booksRes,
    questionsRes,
    readingRes,
    applicationsRes,
    eventRes,
    liftsRes,
  ] = await Promise.all([
      supabase.from('profiles').select('*').single(),
      supabase.from('stats').select('*'),
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
    ]);

  if (profileRes.error) throw new Error(profileRes.error.message);

  const training = ((trainingRes.data ?? [])[0] ?? null) as TrainingQuest | null;
  const today = training?.local_date;
  const quests = ((questsRes.data ?? []) as DailyQuest[]).filter((q) => q.local_date === today);
  const sleepRow = ((sleepRes.data ?? [])[0] ?? null) as SleepLog | null;
  const gymRow = (gymRes.data ?? [])[0] ?? null;
  const eventRow = ((eventRes.data ?? [])[0] ?? null) as SystemEvent | null;
  const dueQuestions = ((questionsRes.data ?? []) as RetentionQuestion[]).filter(
    (q) => q.due_date != null && today != null && q.due_date <= today,
  );
  const todaysBookIds = (rows: Array<{ book_id: string; local_date: string }> | null) =>
    (rows ?? []).filter((r) => r.local_date === today).map((r) => r.book_id);

  set({
    profile: profileRes.data as Profile,
    stats: (statsRes.data ?? []) as StatRow[],
    totals: (totalsRes.data ?? null) as TrainingTotals | null,
    messages: (messagesRes.data ?? []) as SystemMessage[],
    training,
    quests,
    sleep: sleepRow && sleepRow.local_date === today ? sleepRow : null,
    dungeon: (dungeonRes.data ?? null) as DungeonProgress | null,
    gymDoneToday: Boolean(gymRow && gymRow.local_date === today),
    metrics: ((metricsRes.data ?? [])[0] ?? null) as BodyMetrics | null,
    books: (booksRes.data ?? []) as Book[],
    dueQuestions,
    readTodayBookIds: todaysBookIds(readingRes.data),
    appliedTodayBookIds: todaysBookIds(applicationsRes.data),
    event: eventRow && eventRow.local_date === today ? eventRow : null,
    liftLogs: (liftsRes.data ?? []) as LiftLog[],
  });
}
