import { usePlayerStore } from '@/stores/playerStore';
import { SystemWindow } from '@/components/system/SystemWindow';
import { StatBar } from '@/components/system/StatBar';
import { nextMilestones, type MilestoneState } from '@game/milestones.ts';
import { RANKS, type Rank } from '@game/constants.ts';

const KIND_ACCENT = {
  level: 'cyan',
  rank: 'gold',
  boss: 'red',
  title: 'purple',
} as const;

/** Assemble milestone input from the store; null until the profile loads. */
export function useMilestones(limit: number) {
  const {
    profile,
    totals,
    titles,
    books,
    dungeon,
    masteredCount,
    perfectClearCount,
    riddlesSolvedCount,
  } = usePlayerStore();
  if (!profile) return [];

  const state: MilestoneState = {
    level: profile.level,
    rankIndex: Math.max(0, RANKS.indexOf(profile.rank as Rank)),
    bestStreak: Number(totals?.best_streak ?? 0),
    daysCompleted: Number(totals?.days_completed ?? 0),
    totalReps:
      Number(totals?.total_pushups ?? 0) +
      Number(totals?.total_situps ?? 0) +
      Number(totals?.total_squats ?? 0),
    totalRunKm: Number(totals?.total_run_km ?? 0),
    booksFinished: books.filter((b) => b.status === 'finished').length,
    questionsMastered: masteredCount,
    dungeonCycles: Number(dungeon?.cycles_cleared ?? 0),
    perfectClears: perfectClearCount,
    riddlesSolved: riddlesSolvedCount,
    xpTotal: Number(profile.xp_total),
    earnedTitleKeys: titles.map((t) => t.title_key),
    dungeonPhase: Number(dungeon?.phase ?? 1),
    dungeonSessions: Number(dungeon?.sessions_completed ?? 0),
  };

  return nextMilestones(state, limit);
}

/**
 * "Quest conditions: 87% met." — the System teases the nearest unlocks so
 * there is always a visible next reward within reach.
 */
export function NextObjectivesPanel() {
  const milestones = useMilestones(3);
  if (milestones.length === 0) return null;

  return (
    <SystemWindow title="Next Objectives" accent="cyan" delay={0.06}>
      <div className="flex flex-col gap-3">
        {milestones.map((m) => (
          <div key={m.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate font-display text-sm font-semibold text-white">
                {m.label}
              </span>
              <span className="shrink-0 font-sys text-[0.65rem] uppercase tracking-widest text-slate-400">
                {Math.floor(m.progress * 100)}%
              </span>
            </div>
            <StatBar value={m.progress} max={1} accent={KIND_ACCENT[m.kind]} height={6} />
            <div className="mt-1 font-sys text-[0.65rem] uppercase tracking-widest text-slate-400">
              {m.detail}
            </div>
          </div>
        ))}
      </div>
    </SystemWindow>
  );
}
