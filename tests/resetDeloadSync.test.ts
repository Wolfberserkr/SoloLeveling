import { describe, it, expect, beforeEach, vi } from 'vitest';

// A fake Supabase client: every write is recorded, every read returns the
// rows set up by the test. This exercises the real fetchAll / upsertAppState
// mapping and the store's cloud merge, with no network.
type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  rows: {} as Record<string, unknown>,
  writes: [] as Array<{ table: string; op: string; data: Record<string, unknown> }>,
}));

vi.mock('@/lib/supabase', () => {
  const ok = (data: unknown) => Promise.resolve({ data, error: null });
  const from = (table: string) => {
    const read = () => (table === 'reset_app_state' ? db.rows[table] ?? null : db.rows[table] ?? []);
    const q: Record<string, unknown> = {
      select: () => q, eq: () => q, order: () => q, limit: () => q,
      maybeSingle: () => ok(read()),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => ok(read()).then(res, rej),
      upsert: (data: Row) => { db.writes.push({ table, op: 'upsert', data }); return ok(null); },
      insert: (data: Row) => {
        db.writes.push({ table, op: 'insert', data });
        const done = ok({ id: 'new-id' });
        return { select: () => ({ single: () => done }), then: (res: (v: unknown) => unknown) => done.then(res) };
      },
      update: () => q,
    };
    return q;
  };
  return { supabase: { from } };
});

import { fetchAll, upsertAppState, defaultState, type ResetState } from '../src/features/reset/resetDb';
import { phaseOf, useResetStore } from '../src/features/reset/resetStore';

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
const appRow = (extra: Row): Row => ({
  user_id: UID, week: 12, progress: {}, swaps: {}, videos: {}, updated_at: new Date().toISOString(), ...extra,
});
const lastAppUpsert = () => db.writes.filter((w) => w.table === 'reset_app_state' && w.op === 'upsert').at(-1)!.data;

beforeEach(() => {
  store.clear();
  db.rows = {};
  db.writes = [];
});

describe('deload_weeks on the wire', () => {
  it('writes the list as a clean integer array, never null, with the week in range', async () => {
    const s: ResetState = { ...defaultState(), week: 140, deloadWeeks: [9, 9, 'x' as unknown as number, 3] };
    await upsertAppState(UID, s);
    expect(lastAppUpsert()).toMatchObject({ user_id: UID, week: 99, deload_weeks: [3, 9] });

    await upsertAppState(UID, { ...defaultState(), week: 0, deloadWeeks: undefined as unknown as number[] });
    expect(lastAppUpsert()).toMatchObject({ week: 1, deload_weeks: [] });
  });

  it('reads the list back cleaned; a null value is no deloads', async () => {
    db.rows.reset_app_state = appRow({ deload_weeks: [15, 9, 9, null, 2.5] });
    expect((await fetchAll(UID))!.appState!.deloadWeeks).toEqual([9, 15]);
    db.rows.reset_app_state = appRow({ deload_weeks: null });
    expect((await fetchAll(UID))!.appState!.deloadWeeks).toEqual([]);
  });

  it('reports a missing column (old schema) as unknown rather than empty', async () => {
    db.rows.reset_app_state = appRow({});
    expect((await fetchAll(UID))!.appState!.deloadWeeks).toBeNull();
  });
});

describe('the cloud merge on boot', () => {
  it('takes the cloud list like it takes the week', async () => {
    store.set(`reset_state_v1_${UID}`, JSON.stringify({ ...defaultState(), week: 8, deloadWeeks: [] }));
    db.rows.reset_app_state = appRow({ week: 10, deload_weeks: [9] });
    await useResetStore.getState().init(UID);
    const s = useResetStore.getState().s;
    expect(s.week).toBe(10);
    expect(s.deloadWeeks).toEqual([9]);
    expect(phaseOf(s)).toMatchObject({ block: 3, blockWeek: 1, kind: 'base' });
    // And the merged state is what the cache now holds.
    expect(JSON.parse(store.get(`reset_state_v1_${UID}`)!).deloadWeeks).toEqual([9]);
  });

  it('keeps the local list when the cloud row has no column for it', async () => {
    store.set(`reset_state_v1_${UID}`, JSON.stringify({ ...defaultState(), week: 9, deloadWeeks: [9] }));
    db.rows.reset_app_state = appRow({ week: 9 });
    await useResetStore.getState().init(UID);
    expect(useResetStore.getState().s.deloadWeeks).toEqual([9]);
  });

  it('survives garbage from both sides', async () => {
    store.set(`reset_state_v1_${UID}`, JSON.stringify({ ...defaultState(), week: 'x', deloadWeeks: 'oops' }));
    db.rows.reset_app_state = appRow({ week: 500, deload_weeks: { bad: true } });
    await useResetStore.getState().init(UID);
    const s = useResetStore.getState().s;
    expect(s.week).toBe(99);
    expect(s.deloadWeeks).toEqual([]);
    expect(() => phaseOf(s)).not.toThrow();
  });

  it('a toggle after boot is upserted with the new list', async () => {
    db.rows.reset_app_state = appRow({ week: 9, deload_weeks: [] });
    await useResetStore.getState().init(UID);
    useResetStore.getState().toggleDeload();
    await Promise.resolve();
    expect(lastAppUpsert()).toMatchObject({ week: 9, deload_weeks: [9] });
  });
});
