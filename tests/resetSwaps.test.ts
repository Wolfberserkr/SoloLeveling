import { describe, it, expect } from 'vitest';
import { PLAN, RESERVE, SWAPS, exerciseById } from '../src/features/reset/resetData';

/** Every exercise the plan and reserve pool expose, by id. */
const allIds = new Set([
  ...PLAN.flatMap((d) => d.ex.map((e) => e.id)),
  ...RESERVE.map((e) => e.id),
]);

describe('reset swap wiring', () => {
  it('resolves every swap target to a real exercise', () => {
    for (const [from, alts] of Object.entries(SWAPS)) {
      for (const altId of alts) {
        expect(exerciseById(altId), `${from} → ${altId} must resolve`).not.toBeNull();
      }
    }
  });

  it('gives every shadow-jump move a set of alternatives', () => {
    const shadowDays = PLAN.filter((d) => d.name.includes('Shadow Jump'));
    expect(shadowDays.length).toBeGreaterThan(0);
    for (const day of shadowDays) {
      for (const ex of day.ex) {
        expect(SWAPS[ex.id]?.length, `${ex.id} needs swap alternatives`).toBeGreaterThan(0);
        // and no move should ever list itself as its own alternative
        expect(SWAPS[ex.id]).not.toContain(ex.id);
      }
    }
  });

  it('keeps reserve moves swappable once selected', () => {
    for (const r of RESERVE) {
      expect(SWAPS[r.id]?.length, `${r.id} should offer further swaps`).toBeGreaterThan(0);
    }
  });

  it('never points a move at itself and only lists known ids', () => {
    for (const [from, alts] of Object.entries(SWAPS)) {
      expect(alts, `${from} should not swap to itself`).not.toContain(from);
      for (const altId of alts) expect(allIds.has(altId), `${altId} unknown`).toBe(true);
    }
  });
});
