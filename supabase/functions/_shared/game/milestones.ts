// ─────────────────────────────────────────────────────────────────────────────
// MILESTONES — "Quest conditions: 87% met."
//
// Pure selector over already-readable state that surfaces the Player's
// NEAREST upcoming unlocks: next level, next rank, the dungeon boss, and the
// closest unearned titles. Anticipation is a first-class retention lever —
// the System always shows what is almost within reach.
//
// Pure TypeScript, shared client + server (the @game alias). No Deno/Node/DOM.
// ─────────────────────────────────────────────────────────────────────────────
import { RANKS, RANK_TITLES, MAX_LEVEL, type Rank } from './constants.ts';
import { RANK_THRESHOLDS, TITLES, type TitleState, type TitleMetric } from './progression.ts';
import { totalXpForLevel } from './xpCurve.ts';
import { dungeonPhaseFor, allDungeonsCleared, isBossReady } from './dungeons.ts';

export type Milestone = {
  key: string;
  kind: 'level' | 'rank' | 'boss' | 'title';
  label: string;
  detail: string;
  /** 0..1 — how close the unlock is. */
  progress: number;
};

export type MilestoneState = TitleState & {
  xpTotal: number;
  /** Title keys already earned (they are no longer "upcoming"). */
  earnedTitleKeys: string[];
  dungeonPhase: number;
  dungeonSessions: number;
};

const METRIC_UNITS: Record<TitleMetric, string> = {
  level: 'levels',
  rankIndex: 'ranks',
  bestStreak: 'streak days',
  daysCompleted: 'training days',
  totalReps: 'reps',
  totalRunKm: 'km',
  booksFinished: 'tomes',
  questionsMastered: 'checks mastered',
  dungeonCycles: 'dungeon clears',
  perfectClears: 'perfect clears',
  riddlesSolved: 'riddles',
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** The Player's nearest upcoming unlocks, closest first. */
export function nextMilestones(state: MilestoneState, limit = 3): Milestone[] {
  const candidates: Milestone[] = [];

  // Next level — the always-armed carrot.
  if (state.level < MAX_LEVEL) {
    const floor = totalXpForLevel(state.level);
    const ceiling = totalXpForLevel(state.level + 1);
    const remaining = Math.max(0, ceiling - state.xpTotal);
    candidates.push({
      key: 'level',
      kind: 'level',
      label: `Level ${state.level + 1}`,
      detail: `${remaining.toLocaleString()} XP remaining`,
      progress: clamp01((state.xpTotal - floor) / Math.max(1, ceiling - floor)),
    });
  }

  // Next rank — promotion day.
  const nextRank = RANKS.find((r) => RANK_THRESHOLDS[r] > state.level) as Rank | undefined;
  if (nextRank) {
    const target = RANK_THRESHOLDS[nextRank];
    const held = RANKS.filter((r) => RANK_THRESHOLDS[r] <= state.level).pop() as Rank;
    const base = RANK_THRESHOLDS[held];
    candidates.push({
      key: `rank-${nextRank}`,
      kind: 'rank',
      label: `${nextRank}-Rank — ${RANK_TITLES[nextRank]}`,
      detail: `Reach Level ${target} · ${target - state.level} ${
        target - state.level === 1 ? 'level' : 'levels'
      } to go`,
      progress: clamp01((state.level - base) / Math.max(1, target - base)),
    });
  }

  // The dungeon boss — runs remaining until it appears.
  if (!allDungeonsCleared(state.dungeonPhase)) {
    const def = dungeonPhaseFor(state.dungeonPhase);
    const ready = isBossReady(state.dungeonPhase, state.dungeonSessions);
    candidates.push({
      key: `boss-${state.dungeonPhase}`,
      kind: 'boss',
      label: `Boss — ${def.boss.name}`,
      detail: ready
        ? 'The boss awaits your challenge'
        : `${def.sessionsRequired - state.dungeonSessions} dungeon ${
            def.sessionsRequired - state.dungeonSessions === 1 ? 'run' : 'runs'
          } until it appears`,
      progress: ready ? 1 : clamp01(state.dungeonSessions / Math.max(1, def.sessionsRequired)),
    });
  }

  // Closest unearned titles (skip manual grants and already-crossed metrics —
  // those are paid out by the server's own sweep on the next award).
  const earned = new Set(state.earnedTitleKeys);
  const titleCandidates = TITLES.filter((t) => !t.manual && !earned.has(t.key))
    .map((t) => {
      const value = Number(state[t.metric] ?? 0);
      const remaining = t.metric === 'totalRunKm' ? round1(t.threshold - value) : t.threshold - value;
      return {
        key: `title-${t.key}`,
        kind: 'title' as const,
        label: `Title — “${t.name}”`,
        detail: `${remaining} ${METRIC_UNITS[t.metric]} to go · +${t.essence} Essence`,
        progress: clamp01(value / t.threshold),
      };
    })
    .filter((m) => m.progress < 1)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 2);
  candidates.push(...titleCandidates);

  return candidates.sort((a, b) => b.progress - a.progress).slice(0, limit);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
