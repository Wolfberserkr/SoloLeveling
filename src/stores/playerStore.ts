import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { gameAction } from '@/lib/gameApi';
import type {
  Profile,
  StatRow,
  TrainingQuest,
  TrainingTotals,
  SystemMessage,
} from '@/lib/types';

type PlayerState = {
  loading: boolean;
  error: string | null;
  profile: Profile | null;
  stats: StatRow[];
  training: TrainingQuest | null;
  totals: TrainingTotals | null;
  messages: SystemMessage[];
  /** Full refresh: lazy daily reset on the server, then re-read everything. */
  loadAll: () => Promise<void>;
  /** Re-read DB state without re-running the daily reset. */
  refresh: () => Promise<void>;
  setTraining: (q: TrainingQuest) => void;
  reset: () => void;
};

export const usePlayerStore = create<PlayerState>((set) => ({
  loading: true,
  error: null,
  profile: null,
  stats: [],
  training: null,
  totals: null,
  messages: [],

  loadAll: async () => {
    set({ loading: true, error: null });
    try {
      // The System catches up on the day (generates today's quest) first.
      const daily = await gameAction<{ training: TrainingQuest }>('ensure-daily');
      await readState(set);
      set({ training: daily.training, loading: false });
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

  reset: () =>
    set({
      loading: true,
      error: null,
      profile: null,
      stats: [],
      training: null,
      totals: null,
      messages: [],
    }),
}));

async function readState(set: (partial: Partial<PlayerState>) => void) {
  const [profileRes, statsRes, totalsRes, messagesRes, trainingRes] = await Promise.all([
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
  ]);

  if (profileRes.error) throw new Error(profileRes.error.message);

  set({
    profile: profileRes.data as Profile,
    stats: (statsRes.data ?? []) as StatRow[],
    totals: (totalsRes.data ?? null) as TrainingTotals | null,
    messages: (messagesRes.data ?? []) as SystemMessage[],
    training: ((trainingRes.data ?? [])[0] ?? null) as TrainingQuest | null,
  });
}
