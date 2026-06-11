import { describe, it, expect } from 'vitest';
import {
  DUNGEON_PHASES,
  MAX_DUNGEON_PHASE,
  dungeonPhaseFor,
  allDungeonsCleared,
  isBossReady,
  bossDefeated,
} from '@game/dungeons.ts';
import { baseTrainingTargets } from '@game/training.ts';

describe('dungeon phase definitions', () => {
  it('runs Foundation through Master Physique, numbered contiguously', () => {
    expect(DUNGEON_PHASES[0].name).toBe('Foundation');
    expect(DUNGEON_PHASES[MAX_DUNGEON_PHASE - 1].name).toBe('Master Physique');
    DUNGEON_PHASES.forEach((p, i) => expect(p.phase).toBe(i + 1));
  });

  it('every phase has a real campaign length and a non-trivial boss', () => {
    for (const p of DUNGEON_PHASES) {
      expect(p.sessionsRequired).toBeGreaterThanOrEqual(20); // ≥ ~7 weeks at 3/wk
      expect(p.template.length).toBeGreaterThanOrEqual(5);
      expect(p.boss.benchmarks.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('campaign lasts long enough for a 1–2 year arc at 3 sessions/week', () => {
    const totalSessions = DUNGEON_PHASES.reduce((sum, p) => sum + p.sessionsRequired, 0);
    const weeks = totalSessions / 3;
    expect(weeks).toBeGreaterThanOrEqual(45); // ~a year of lifting minimum
  });

  it('benchmark keys are unique within each boss', () => {
    for (const p of DUNGEON_PHASES) {
      const keys = p.boss.benchmarks.map((b) => b.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('dungeon helpers', () => {
  it('clamps phase lookups and detects campaign completion', () => {
    expect(dungeonPhaseFor(0).phase).toBe(1);
    expect(dungeonPhaseFor(99).phase).toBe(MAX_DUNGEON_PHASE);
    expect(allDungeonsCleared(MAX_DUNGEON_PHASE)).toBe(false);
    expect(allDungeonsCleared(MAX_DUNGEON_PHASE + 1)).toBe(true);
  });

  it('boss appears only after the required runs', () => {
    const need = DUNGEON_PHASES[0].sessionsRequired;
    expect(isBossReady(1, need - 1)).toBe(false);
    expect(isBossReady(1, need)).toBe(true);
    expect(isBossReady(MAX_DUNGEON_PHASE + 1, 999)).toBe(false);
  });

  it('boss falls only when every benchmark is confirmed true', () => {
    const all = Object.fromEntries(DUNGEON_PHASES[0].boss.benchmarks.map((b) => [b.key, true]));
    expect(bossDefeated(1, all)).toBe(true);
    const partial = { ...all, [DUNGEON_PHASES[0].boss.benchmarks[0].key]: false };
    expect(bossDefeated(1, partial)).toBe(false);
    expect(bossDefeated(1, { ...all, extra: 'yes' })).toBe(true); // extras ignored
    expect(bossDefeated(1, {})).toBe(false);
  });
});

describe('dungeon clears raise the daily baseline', () => {
  it('each cycle adds one notch to training targets', () => {
    const base = baseTrainingTargets(5, 0);
    const after = baseTrainingTargets(5, 2);
    expect(after.pushups).toBe(base.pushups + 10);
    expect(after.runKm).toBeCloseTo(base.runKm + 0.5);
  });
});
