import { describe, it, expect } from 'vitest';
import { streakNudge, STREAK_NUDGE_MIN, type StreakNudgeInput } from '@game/streak.ts';

const YESTERDAY = '2026-06-15';
const TODAY = '2026-06-16';

function nudgeInput(over: Partial<StreakNudgeInput> = {}): StreakNudgeInput {
  return {
    currentStreak: 10,
    lastCompletedDate: YESTERDAY,
    yesterday: YESTERDAY,
    completedToday: false,
    hasShield: false,
    ...over,
  };
}

describe('streakNudge', () => {
  it('fires when a meaningful streak hangs on tonight, citing the number', () => {
    const n = streakNudge(nudgeInput({ currentStreak: 12 }));
    expect(n).not.toBeNull();
    expect(n!.title).toContain('12');
    expect(n!.body).toContain('12');
  });

  it('stays silent once today is already trained', () => {
    expect(streakNudge(nudgeInput({ completedToday: true }))).toBeNull();
  });

  it('leaves short streaks to the plain reminder', () => {
    expect(streakNudge(nudgeInput({ currentStreak: STREAK_NUDGE_MIN - 1 }))).toBeNull();
    expect(streakNudge(nudgeInput({ currentStreak: STREAK_NUDGE_MIN }))).not.toBeNull();
  });

  it('only fires when the streak is alive today (last completion was yesterday)', () => {
    // Already lapsed (last completion two days ago) → nothing to save tonight.
    expect(streakNudge(nudgeInput({ lastCompletedDate: '2026-06-14' }))).toBeNull();
    // Already trained today → last_completed_date would be today, not at risk.
    expect(streakNudge(nudgeInput({ lastCompletedDate: TODAY }))).toBeNull();
    // Never completed.
    expect(streakNudge(nudgeInput({ lastCompletedDate: null }))).toBeNull();
  });

  it('does not cry wolf when a single-miss shield is held', () => {
    expect(streakNudge(nudgeInput({ hasShield: true }))).toBeNull();
  });
});
