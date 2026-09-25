import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dayCount, localDate, rolloverProgress, useResetStore } from '../src/features/reset/resetStore';
import { defaultState, type ResetState } from '../src/features/reset/resetDb';

// Same localStorage stub as the store-action tests: the cache path stays real.
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
const at = (iso: string) => vi.setSystemTime(new Date(iso));

function withTicks(date: string): ResetState {
  return {
    ...defaultState(),
    progressDate: date,
    progress: {
      'lower-a': { 'leg-press': [true, true, false, false] },
      'upper-a': { 'chest-press': [false, false, false, false] }, // opened, nothing ticked
    },
  };
}

describe('rolloverProgress — pure', () => {
  it('does nothing on the same day', () => {
    const s = withTicks('2026-09-25');
    const { next, logged } = rolloverProgress(s, '2026-09-25');
    expect(next).toBe(s);
    expect(logged).toEqual([]);
  });

  it('logs ticked sessions on their own day and clears every ring', () => {
    const { next, logged } = rolloverProgress(withTicks('2026-09-24'), '2026-09-25');
    expect(logged.map((e) => e.dayId)).toEqual(['lower-a']); // untouched upper-a is not logged
    expect(logged[0].done).toBe(2);
    expect(logged[0].total).toBeGreaterThan(2);                // partial
    expect(localDate(new Date(logged[0].date))).toBe('2026-09-24');
    expect(next.progress).toEqual({});
    expect(next.progressDate).toBe('2026-09-25');
    expect(dayCount(next, 'lower-a').pct).toBe(0);
    // The calendar keeps the training.
    expect(next.history.map((h) => h.dayId)).toEqual(['lower-a']);
    expect(next.sessions[0].dayId).toBe('lower-a');
  });

  it('keeps older history in date order around the new entry', () => {
    const s = withTicks('2026-09-24');
    const older = { dayId: 'upper-b', name: 'Upper B', date: '2026-09-20T12:00:00.000Z', done: 5, total: 5, exercises: [] };
    const { next } = rolloverProgress({ ...s, history: [older], sessions: [older] }, '2026-09-25');
    expect(next.history.map((h) => h.dayId)).toEqual(['upper-b', 'lower-a']);
    expect(next.sessions.map((h) => h.dayId)).toEqual(['lower-a', 'upper-b']);
  });

  it('stamps undated progress as today instead of guessing its day', () => {
    const s = { ...withTicks('x'), progressDate: undefined };
    const { next, logged } = rolloverProgress(s, '2026-09-25');
    expect(logged).toEqual([]);
    expect(next.progress).toBe(s.progress);
    expect(next.progressDate).toBe('2026-09-25');
  });

  it('ignores a clock that went backwards', () => {
    const s = withTicks('2026-09-26');
    expect(rolloverProgress(s, '2026-09-25').next).toBe(s);
  });
});

describe('store — the 00:00 reset', () => {
  beforeEach(() => {
    store.clear();
    vi.useFakeTimers();
    useResetStore.setState({ uid: UID, ready: true, s: defaultState() });
  });
  afterEach(() => vi.useRealTimers());

  it('stamps ticks with today and resets them after midnight, keeping the workout', () => {
    at('2026-09-25T19:00:00');
    const { toggleSet } = useResetStore.getState();
    toggleSet('lower-a', 'leg-press', 0);
    toggleSet('lower-a', 'leg-press', 1);
    expect(useResetStore.getState().s.progressDate).toBe('2026-09-25');
    expect(dayCount(useResetStore.getState().s, 'lower-a').done).toBe(2);

    at('2026-09-25T23:59:00');
    useResetStore.getState().rollover();
    expect(dayCount(useResetStore.getState().s, 'lower-a').done).toBe(2); // still today

    at('2026-09-26T00:00:30');
    useResetStore.getState().rollover();
    const s = useResetStore.getState().s;
    expect(dayCount(s, 'lower-a').pct).toBe(0);
    expect(s.history).toHaveLength(1);
    expect(localDate(new Date(s.history[0].date))).toBe('2026-09-25');
    // Persisted, so a reload doesn't resurrect yesterday's ticks.
    expect(JSON.parse(store.get(`reset_state_v1_${UID}`)!).progress).toEqual({});
  });

  it('a first tick after midnight closes yesterday out before counting', () => {
    at('2026-09-25T20:00:00');
    useResetStore.getState().toggleSet('upper-a', 'chest-press', 0);
    at('2026-09-26T07:00:00');
    useResetStore.getState().toggleSet('lower-a', 'leg-press', 0);
    const s = useResetStore.getState().s;
    expect(dayCount(s, 'upper-a').done).toBe(0);
    expect(dayCount(s, 'lower-a').done).toBe(1);
    expect(s.history.map((h) => h.dayId)).toEqual(['upper-a']);
    expect(s.progressDate).toBe('2026-09-26');
  });

  it('a finished session is not logged twice at midnight', () => {
    at('2026-09-25T19:00:00');
    const st = useResetStore.getState();
    st.toggleSet('lower-a', 'leg-press', 0);
    st.finishSession('lower-a');
    at('2026-09-26T00:01:00');
    useResetStore.getState().rollover();
    expect(useResetStore.getState().s.history).toHaveLength(1);
  });
});
