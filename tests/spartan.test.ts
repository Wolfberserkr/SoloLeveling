import { describe, expect, it } from 'vitest';
import {
  buildSpartanSnapshot,
  chapterByIndex,
  chapterConditions,
  chapterCleared,
  chapterDeadline,
  collapsePenalty,
  daysUntil,
  isChapterOverdue,
  isFinalChapter,
  SPARTAN_CHAPTERS,
  SPARTAN_FINAL_CHAPTER,
  SPARTAN_REENLIST_COOLDOWN_DAYS,
  type SpartanMetrics,
} from '@game/spartan.ts';
import { RANK_THRESHOLDS, rankForLevel } from '@game/progression.ts';
import { totalXpForLevel } from '@game/xpCurve.ts';

const full = (over: Partial<SpartanMetrics> = {}): SpartanMetrics => ({
  weightKg: 105,
  streak: 30,
  dungeonPhase: 5,
  proteinDaysThisWeek: 6,
  gymDaysThisWeek: 4,
  ...over,
});

describe('spartan chapters', () => {
  it('has four chapters mapped to dungeon phases 1–4', () => {
    expect(SPARTAN_CHAPTERS).toHaveLength(4);
    expect(SPARTAN_CHAPTERS.map((c) => c.dungeonPhase)).toEqual([1, 2, 3, 4]);
    expect(chapterByIndex(1).key).toBe('foundation');
    expect(chapterByIndex(99).index).toBe(4); // clamps
    expect(isFinalChapter(SPARTAN_FINAL_CHAPTER)).toBe(true);
    expect(isFinalChapter(1)).toBe(false);
  });

  it('only the final chapter grants the exclusive shadow + gear', () => {
    expect(chapterByIndex(1).reward.shadow).toBeUndefined();
    expect(chapterByIndex(4).reward.shadow).toBe(true);
    expect(chapterByIndex(4).reward.gear).toBe('spartans_aegis');
  });
});

describe('chapter conditions', () => {
  it('clears only when every checkpoint is met', () => {
    const ch = chapterByIndex(2); // Iron Path: weight ≤107, streak ≥12, boss phase>2
    expect(chapterCleared(chapterConditions(ch, full()))).toBe(true);
  });

  it('bodyweight is a "lower-is-better" target', () => {
    const ch = chapterByIndex(2); // weightTarget 107
    const heavy = chapterConditions(ch, full({ weightKg: 108 })).find((c) => c.key === 'weight')!;
    const lean = chapterConditions(ch, full({ weightKg: 107 })).find((c) => c.key === 'weight')!;
    expect(heavy.met).toBe(false);
    expect(lean.met).toBe(true);
    expect(lean.dir).toBe('lte');
  });

  it('the exit boss requires moving past the mapped dungeon phase', () => {
    const ch = chapterByIndex(2); // needs dungeonPhase > 2
    expect(chapterConditions(ch, full({ dungeonPhase: 2 })).find((c) => c.key === 'boss')!.met).toBe(false);
    expect(chapterConditions(ch, full({ dungeonPhase: 3 })).find((c) => c.key === 'boss')!.met).toBe(true);
  });

  it('marks unsynced derived inputs pending, never met', () => {
    const ch = chapterByIndex(1);
    const conds = chapterConditions(ch, full({ weightKg: null, proteinDaysThisWeek: null }));
    const weight = conds.find((c) => c.key === 'weight')!;
    const protein = conds.find((c) => c.key === 'protein')!;
    expect(weight.pending).toBe(true);
    expect(weight.met).toBe(false);
    expect(protein.pending).toBe(true);
    expect(chapterCleared(conds)).toBe(false);
  });
});

describe('deadlines', () => {
  it('sets a chapter deadline durationDays after it starts', () => {
    const ch = chapterByIndex(1); // 45 days
    expect(chapterDeadline('2026-07-06', ch)).toBe('2026-08-20');
    expect(daysUntil('2026-07-06', '2026-08-20')).toBe(45);
  });

  it('is overdue only once the deadline has fully passed', () => {
    const ch = chapterByIndex(1);
    const deadline = chapterDeadline('2026-01-01', ch); // 2026-02-15
    expect(isChapterOverdue(deadline, '2026-01-01', ch)).toBe(false);
    expect(isChapterOverdue('2026-02-16', '2026-01-01', ch)).toBe(true);
  });
});

describe('collapse penalty', () => {
  it('demotes exactly one rank to its floor and forfeits the XP above it', () => {
    const level = RANK_THRESHOLDS.C + 2; // solidly C-rank
    expect(rankForLevel(level)).toBe('C');
    const xpTotal = totalXpForLevel(level) + 500;
    const p = collapsePenalty(level, xpTotal);
    expect(p.demotedFrom).toBe('C');
    expect(p.newRank).toBe('D');
    expect(p.newLevel).toBe(RANK_THRESHOLDS.D);
    expect(p.newXpTotal).toBe(totalXpForLevel(RANK_THRESHOLDS.D));
    expect(p.lostXp).toBe(xpTotal - p.newXpTotal);
  });

  it('at the lowest rank, burns half the XP instead of nothing', () => {
    const p = collapsePenalty(2, 200); // level 2 is still E-rank
    expect(p.demotedFrom).toBe('E');
    expect(p.newXpTotal).toBe(100);
    expect(p.lostXp).toBe(100);
  });
});

describe('snapshot', () => {
  it('reports inactive when there is no campaign row', () => {
    const snap = buildSpartanSnapshot(null, full(), '2026-07-06');
    expect(snap.status).toBe('inactive');
    expect(snap.chapter).toBeNull();
    expect(snap.canReenlist).toBe(true);
  });

  it('gates re-enlistment on the cooldown date after a collapse', () => {
    const failed = {
      status: 'failed' as const,
      current_chapter: 2,
      chapters_cleared: 1,
      enlisted_at: '2026-01-01',
      chapter_started_at: '2026-02-01',
      reenlist_available_on: '2026-07-20',
      failed_at: '2026-07-06',
      completed_at: null,
    };
    expect(buildSpartanSnapshot(failed, full(), '2026-07-06').canReenlist).toBe(false);
    expect(buildSpartanSnapshot(failed, full(), '2026-07-20').canReenlist).toBe(true);
  });

  it('surfaces the active chapter with live conditions and deadline', () => {
    const active = {
      status: 'active' as const,
      current_chapter: 1,
      chapters_cleared: 0,
      enlisted_at: '2026-07-06',
      chapter_started_at: '2026-07-06',
      reenlist_available_on: null,
      failed_at: null,
      completed_at: null,
    };
    const snap = buildSpartanSnapshot(active, full({ weightKg: 110, streak: 8, dungeonPhase: 2 }), '2026-07-10');
    expect(snap.status).toBe('active');
    expect(snap.chapter?.name).toBe('Foundation');
    expect(snap.chapter?.allMet).toBe(true);
    expect(snap.chapter?.daysLeft).toBe(41); // 45-day budget, 4 days elapsed
    expect(SPARTAN_REENLIST_COOLDOWN_DAYS).toBe(14);
  });
});
