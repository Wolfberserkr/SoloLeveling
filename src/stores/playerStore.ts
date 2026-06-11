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
  totals: TrainingTotals | null;
  messages: SystemMessage[];
  /** Full refresh: lazy daily reset on the server, then re-read everything. */
  loadAll: () => Promise<void>;
  /** Re-read DB state without re-running the daily reset. */
  refresh: () => Promise<void>;
  setTraining: (q: TrainingQuest) => void;
  setQuest: (q: DailyQuest) => void;
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
  totals: null,
  messages: [],

  loadAll: async () => {
    set({ loading: true, error: null });
    try {
      // The System catches up on the day (generates today's quests) first.
      const daily = await gameAction<{ training: TrainingQuest; quests: DailyQuest[] }>(
        'ensure-daily',
      );
      await readState(set);
      set({ training: daily.training, quests: daily.quests, loading: false });
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

  reset: () =>
    set({
      loading: true,
      error: null,
      profile: null,
      stats: [],
      training: null,
      quests: [],
      sleep: null,
      totals: null,
      messages: [],
    }),
}));

async function readState(set: (partial: Partial<PlayerState>) => void) {
  const [profileRes, statsRes, totalsRes, messagesRes, trainingRes, questsRes, sleepRes] =
    await Promise.all([
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
    ]);

  if (profileRes.error) throw new Error(profileRes.error.message);

  const training = ((trainingRes.data ?? [])[0] ?? null) as TrainingQuest | null;
  const today = training?.local_date;
  const quests = ((questsRes.data ?? []) as DailyQuest[]).filter((q) => q.local_date === today);
  const sleepRow = ((sleepRes.data ?? [])[0] ?? null) as SleepLog | null;

  set({
    profile: profileRes.data as Profile,
    stats: (statsRes.data ?? []) as StatRow[],
    totals: (totalsRes.data ?? null) as TrainingTotals | null,
    messages: (messagesRes.data ?? []) as SystemMessage[],
    training,
    quests,
    sleep: sleepRow && sleepRow.local_date === today ? sleepRow : null,
  });
}
