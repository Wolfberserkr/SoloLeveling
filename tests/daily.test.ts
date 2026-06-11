import { describe, it, expect } from 'vitest';
import {
  rollTrainingVariant,
  rollSideQuests,
  SIDE_QUEST_POOL,
  SIDE_QUESTS_PER_DAY,
} from '@game/daily.ts';
import { dailyRng } from '@game/rng.ts';

const USER = '8d9f2c1a-1111-2222-3333-444455556666';

describe('seeded RNG', () => {
  it('is deterministic for the same user + date', () => {
    const a = dailyRng(USER, '2026-06-11');
    const b = dailyRng(USER, '2026-06-11');
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it('differs across dates', () => {
    const a = dailyRng(USER, '2026-06-11')();
    const b = dailyRng(USER, '2026-06-12')();
    expect(a).not.toBe(b);
  });
});

describe('training variant roll', () => {
  it('is idempotent per user+date (lazy reset can re-run safely)', () => {
    expect(rollTrainingVariant(USER, '2026-06-11')).toBe(rollTrainingVariant(USER, '2026-06-11'));
  });

  it('never rolls recovery — recovery is state-triggered only', () => {
    for (let d = 1; d <= 28; d++) {
      const date = `2026-06-${String(d).padStart(2, '0')}`;
      expect(rollTrainingVariant(USER, date)).not.toBe('recovery');
    }
  });

  it('rolls standard most often', () => {
    let standard = 0;
    for (let i = 0; i < 365; i++) {
      const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      if (rollTrainingVariant(USER, date) === 'standard') standard++;
    }
    expect(standard / 365).toBeGreaterThan(0.45);
    expect(standard / 365).toBeLessThan(0.75);
  });
});

describe('side quest roll', () => {
  it('is idempotent per user+date', () => {
    const a = rollSideQuests(USER, '2026-06-11').map((q) => q.key);
    const b = rollSideQuests(USER, '2026-06-11').map((q) => q.key);
    expect(a).toEqual(b);
  });

  it('picks the configured count with no duplicates', () => {
    for (let d = 1; d <= 28; d++) {
      const date = `2026-06-${String(d).padStart(2, '0')}`;
      const keys = rollSideQuests(USER, date).map((q) => q.key);
      expect(keys).toHaveLength(SIDE_QUESTS_PER_DAY);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('every pool entry costs mana and pays XP', () => {
    for (const q of SIDE_QUEST_POOL) {
      expect(q.manaCost).toBeGreaterThan(0);
      expect(q.xp).toBeGreaterThan(0);
    }
  });

  it('eventually surfaces the whole pool', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      for (const q of rollSideQuests(USER, date)) seen.add(q.key);
    }
    expect(seen.size).toBe(SIDE_QUEST_POOL.length);
  });
});
