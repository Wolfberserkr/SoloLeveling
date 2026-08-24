import { describe, it, expect, beforeEach } from 'vitest';
import { dayById, exerciseById } from '../src/features/reset/resetData';
import { dayCount, resolvedExercise, setsArray, useResetStore } from '../src/features/reset/resetStore';
import { defaultState } from '../src/features/reset/resetDb';

// The store persists through localStorage; node has none. A stub keeps the
// cache path real (so a round-trip is actually exercised) instead of swallowed
// by the try/catch that guards it in the browser.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const UID = 'test-uid';
const DAY = 'lower-a';
const SLOT = 'leg-press';    // 4 sets
const ALT = 'hack-squat';    // 3 sets

/** The boxes the day view would render for a slot. */
function boxes(dayId: string, slotId: string): boolean[] {
  const s = useResetStore.getState().s;
  return setsArray(s.progress[dayId]?.[slotId], resolvedExercise(s, dayId, slotId).sets);
}
function stored(dayId: string, slotId: string): boolean[] | undefined {
  return useResetStore.getState().s.progress[dayId]?.[slotId];
}

beforeEach(() => {
  store.clear();
  useResetStore.setState({ uid: UID, ready: true, s: defaultState() });
});

describe('swapping a machine mid-session (the busy-gym path)', () => {
  it('keeps the sets she already ticked when the swap has fewer sets', () => {
    const { toggleSet, confirmSwap } = useResetStore.getState();
    [0, 1, 2].forEach((i) => toggleSet(DAY, SLOT, i));
    expect(boxes(DAY, SLOT)).toEqual([true, true, true, false]);

    // The leg press is taken; she swaps to the hack squat.
    confirmSwap(DAY, SLOT, ALT);

    expect(resolvedExercise(useResetStore.getState().s, DAY, SLOT).id).toBe(ALT);
    expect(boxes(DAY, SLOT)).toEqual([true, true, true]);
    // The resize lands at swap time, not on the next tap.
    expect(stored(DAY, SLOT)).toEqual([true, true, true]);
  });

  it('does not wipe the day on the next tap, however many times she taps', () => {
    const { toggleSet, confirmSwap } = useResetStore.getState();
    [0, 1, 2].forEach((i) => toggleSet(DAY, SLOT, i));
    confirmSwap(DAY, SLOT, ALT);

    const t = useResetStore.getState().toggleSet;
    t(DAY, SLOT, 0);
    expect(boxes(DAY, SLOT)).toEqual([false, true, true]);
    t(DAY, SLOT, 0);
    expect(boxes(DAY, SLOT)).toEqual([true, true, true]);   // stable, no wipe loop
    expect(dayCount(useResetStore.getState().s, DAY).done).toBe(3);
  });

  it('counts the day against the swapped-in exercise, never above 100%', () => {
    const { toggleSet, confirmSwap } = useResetStore.getState();
    [0, 1, 2, 3].forEach((i) => toggleSet(DAY, SLOT, i));
    const before = dayCount(useResetStore.getState().s, DAY);
    expect(before.done).toBe(4);

    confirmSwap(DAY, SLOT, ALT);
    const after = dayCount(useResetStore.getState().s, DAY);
    const delta = exerciseById(SLOT)!.sets - exerciseById(ALT)!.sets;
    expect(after.total).toBe(before.total - delta);
    expect(after.done).toBe(3);            // the 4th tick no longer fits
    expect(after.pct).toBeLessThanOrEqual(100);
  });

  it('restores the original set count without inventing a tick', () => {
    const { toggleSet, confirmSwap } = useResetStore.getState();
    [0, 1, 2].forEach((i) => toggleSet(DAY, SLOT, i));
    confirmSwap(DAY, SLOT, ALT);
    useResetStore.getState().restoreSwap(DAY, SLOT);

    expect(resolvedExercise(useResetStore.getState().s, DAY, SLOT).id).toBe(SLOT);
    expect(boxes(DAY, SLOT)).toEqual([true, true, true, false]);
  });

  it('survives the cache round-trip the app reloads through', () => {
    const { toggleSet, confirmSwap } = useResetStore.getState();
    [0, 1, 2].forEach((i) => toggleSet(DAY, SLOT, i));
    confirmSwap(DAY, SLOT, ALT);

    const live = useResetStore.getState().s;
    const cached = JSON.parse(store.get(`reset_state_v1_${UID}`)!) as typeof live;
    expect(cached.swaps[DAY][SLOT]).toBe(ALT);
    expect(cached.progress[DAY][SLOT]).toEqual(live.progress[DAY][SLOT]);
  });
});

describe('finishing a swapped session', () => {
  it('logs the exercise she actually did, with counts that agree', () => {
    const { toggleSet, confirmSwap } = useResetStore.getState();
    [0, 1, 2].forEach((i) => toggleSet(DAY, SLOT, i));
    confirmSwap(DAY, SLOT, ALT);

    const r = useResetStore.getState().finishSession(DAY);
    expect(r.done).toBeLessThanOrEqual(r.total);

    const session = useResetStore.getState().s.history.at(-1)!;
    const row = session.exercises.find((e) => e.slot_id === SLOT)!;
    expect(row.name).toBe(exerciseById(ALT)!.name);
    expect(row.sets_done).toBe(3);
    expect(row.sets_total).toBe(3);
    expect(session.done).toBeLessThanOrEqual(session.total);

    // The day is cleared and sized for the swapped exercise, ready for next week.
    expect(boxes(DAY, SLOT)).toEqual([false, false, false]);
    expect(dayCount(useResetStore.getState().s, DAY).done).toBe(0);
  });

  it('clears every slot of the day on reset', () => {
    const { toggleSet } = useResetStore.getState();
    dayById(DAY)!.ex.forEach((e) => toggleSet(DAY, e.id, 0));
    expect(dayCount(useResetStore.getState().s, DAY).done).toBe(dayById(DAY)!.ex.length);

    useResetStore.getState().resetDay(DAY);
    expect(dayCount(useResetStore.getState().s, DAY).done).toBe(0);
  });
});
