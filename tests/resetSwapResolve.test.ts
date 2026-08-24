import { describe, it, expect } from 'vitest';
import { PLAN, RETIRED, SWAPS, exerciseById, dayById } from '../src/features/reset/resetData';
import { dayCount, resolvedExercise, sessionTally } from '../src/features/reset/resetStore';
import { defaultState, type ResetState } from '../src/features/reset/resetDb';

function stateWith(swaps: ResetState['swaps'], progress: ResetState['progress'] = {}): ResetState {
  return { ...defaultState(), swaps, progress };
}

/** Every plan slot that still has a saved swap pointing at a retired id. The
 *  home program's swap lists were saved per user, so these survive in state
 *  long after the exercise left the program. */
const staleCases = [
  { dayId: 'lower-a', slotId: 'dead-bug', altId: 'plank-a' },
  { dayId: 'lower-b', slotId: 'bird-dog', altId: 'plank-a' },
  { dayId: 'mobility-wed', slotId: 'wgs-wed', altId: 'reverse-lunge' },
  { dayId: 'mobility-sat', slotId: 'wgs-sat', altId: 'reverse-lunge' },
];

describe('a swap saved onto a retired exercise', () => {
  it('is a real scenario: those ids resolve to retired stubs', () => {
    for (const { altId } of staleCases) {
      expect(RETIRED[altId], `${altId} should be a retired id`).toBeTruthy();
      expect(exerciseById(altId)?.retired).toBe(true);
    }
  });

  it('falls back to the plan exercise instead of the stub', () => {
    for (const { dayId, slotId, altId } of staleCases) {
      const s = stateWith({ [dayId]: { [slotId]: altId } });
      const e = resolvedExercise(s, dayId, slotId);
      expect(e.id, `${dayId}/${slotId} must fall back to its plan exercise`).toBe(slotId);
      expect(e.retired).toBeFalsy();
      expect(e.sets).toBeGreaterThan(0);
      expect(e.reps).not.toBe('');
    }
  });

  it('keeps the day countable — no 0-set exercise, no 118% session', () => {
    const { dayId, slotId, altId } = staleCases[0];
    const day = dayById(dayId)!;
    const planTotal = day.ex.reduce((a, e) => a + e.sets, 0);
    // Every set ticked, with the stale swap in state.
    const progress = {
      [dayId]: Object.fromEntries(day.ex.map((e) => [e.id, new Array(e.sets).fill(true)])),
    };
    const s = stateWith({ [dayId]: { [slotId]: altId } }, progress);

    const c = dayCount(s, dayId);
    expect(c.total).toBe(planTotal);
    expect(c.done).toBe(planTotal);
    expect(c.pct).toBe(100);

    const tally = sessionTally(s, dayId);
    expect(tally.total).toBe(planTotal);
    expect(tally.done).toBe(planTotal);
    expect(tally.exercises.every((e) => e.sets_total > 0)).toBe(true);
    expect(tally.exercises.find((e) => e.slot_id === slotId)!.name).toBe(exerciseById(slotId)!.name);
  });

  it('still offers her alternatives (the stub has no swap list)', () => {
    for (const { dayId, slotId, altId } of staleCases) {
      const s = stateWith({ [dayId]: { [slotId]: altId } });
      const current = resolvedExercise(s, dayId, slotId);
      expect(SWAPS[current.id]?.length, `${slotId} should still offer swaps`).toBeGreaterThan(0);
    }
  });
});

describe('a live swap that changes the set count', () => {
  const dayId = 'lower-a';
  const slotId = 'leg-press';   // 4 sets
  const altId = 'hack-squat';   // 3 sets

  it('sizes the day by the exercise she actually performs', () => {
    const s = stateWith({ [dayId]: { [slotId]: altId } });
    expect(resolvedExercise(s, dayId, slotId).id).toBe(altId);
    const plan = dayById(dayId)!.ex.reduce((a, e) => a + e.sets, 0);
    const swapped = dayCount(s, dayId).total;
    expect(swapped).toBe(plan - (exerciseById(slotId)!.sets - exerciseById(altId)!.sets));
  });

  it('never reports more sets done than the session prescribed', () => {
    // Stale progress from before the swap: 4 ticked boxes against a 3-set move.
    const progress = { [dayId]: { [slotId]: [true, true, true, true] } };
    const s = stateWith({ [dayId]: { [slotId]: altId } }, progress);
    const tally = sessionTally(s, dayId);
    const row = tally.exercises.find((e) => e.slot_id === slotId)!;
    expect(row.sets_total).toBe(3);
    expect(row.sets_done).toBeLessThanOrEqual(row.sets_total);
    expect(tally.done).toBeLessThanOrEqual(tally.total);
    expect(dayCount(s, dayId).pct).toBeLessThanOrEqual(100);
  });

  it('holds done <= total for every day, swapped or not', () => {
    for (const d of PLAN) {
      const progress = {
        [d.id]: Object.fromEntries(d.ex.map((e) => [e.id, new Array(e.sets + 2).fill(true)])),
      };
      for (const swaps of [{}, { [d.id]: Object.fromEntries(d.ex.map((e) => [e.id, SWAPS[e.id]?.[0] ?? e.id])) }]) {
        const s = stateWith(swaps, progress);
        const c = dayCount(s, d.id);
        expect(c.done, `${d.id} done <= total`).toBeLessThanOrEqual(c.total);
        const tally = sessionTally(s, d.id);
        expect(tally.done, `${d.id} tally done <= total`).toBeLessThanOrEqual(tally.total);
      }
    }
  });
});
