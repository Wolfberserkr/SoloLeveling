import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SESS } from '../supabase/functions/_shared/viking/data.ts';
import { emptyData, type VikingData } from '../supabase/functions/_shared/viking/logic.ts';
import { importStrength, sessionOf, type GarminIn, type ImportResult } from '../supabase/functions/_shared/viking/garminImport.ts';

const load = (f: string) => JSON.parse(readFileSync(`tests/fixtures/${f}`, 'utf8')) as GarminIn;
const la = load('garmin-2026-11-25-lower-a.json'), ub = load('garmin-2026-11-20-upper-b-deload.json'), ua = load('garmin-2026-11-24-upper-a.json');
const D0 = () => ({ ...emptyData(), settings: { startDate: '2026-10-10', startWeight: 102, phaseMode: 'auto', kcalAdjust: 0 } }) as VikingData;

describe('garmin import', () => {
it('import: 25 Nov Lower A (old library workout) maps every set', () => {
  const r = importStrength(la, D0(), null, 1) as ImportResult;
  expect(r).toMatchObject({ session: 'LA', docId: '2026-11-25_LA', dropped: 0, merged: false });
  const by = Object.fromEntries(r.doc.entries.map((e) => [e.ex, e.sets]));
  expect(by.squat).toEqual([0, 1, 2].map(() => ({ kg: 110, reps: 5, est: ['reps'] })));
  expect(by.rdl).toEqual([{ kg: 120, reps: 5 }, { kg: 110, reps: 10 }]);
  expect(by.crunch).toEqual([{ kg: 0, reps: 15, est: ['kg'] }]);
  expect(r.assumptions).toEqual(expect.arrayContaining([
    'Back squat: reps not recorded, assumed 5', 'Romanian deadlift: 2 of 3 sets', 'Cable crunch: kg not recorded',
  ]));
  expect(r.doc).toMatchObject({ source: 'garmin', garminIds: ['25193624779'], week: 7, deload: false });
});
it('import: 20 Nov deload drops the trailing UNKNOWN set and keeps the pull-up assist-free', () => {
  const r = importStrength(ub, D0(), null, 1) as ImportResult;
  expect(r.session).toBe('UB'); expect(r.dropped).toBe(1);
  expect(r.doc.entries.map((e) => e.ex)).toEqual(['incbb', 'pullup', 'mpress']);
  expect(r.doc.entries[1].sets[0]).toEqual({ kg: 0, reps: 6, est: ['reps'] }); // weight null is recorded, reps assumed
  expect(r.doc.deload).toBe(true);
  expect(r.doc.startedAt).toBe('2026-11-20T11:00:59Z');
});
it('import: 24 Nov Upper A (drifted library) maps every recognised set', () => {
  const r = importStrength(ua, D0(), null, 1) as ImportResult;
  const unknown = ua.sets.filter((s) => s.type === 'ACTIVE' && (!s.category || s.category === 'UNKNOWN')).length;
  expect(r.session).toBe('UA'); expect(r.dropped).toBe(unknown); // UA has no null-category exercises
  for (const e of r.doc.entries) expect(SESS.UA.ex.map((x) => x.k)).toContain(e.ex);
});
it('import: an UNKNOWN set at a null-category exercise index maps to it (leg extension)', () => {
  const lb: GarminIn = { activityId: 'x', name: 'Viking Lower B', date: '2026-11-26', start: '2026-11-26T06:00', startUtc: '2026-11-26T10:00:00Z', insertedAt: '',
    sets: [{ category: 'UNKNOWN', name: null, reps: 15, weightG: 56000, type: 'ACTIVE', idx: 6 }] }; // legext is LB's 3rd exercise
  const r = importStrength(lb, D0(), { legext: { kg: 56, reps: 12, sets: 2, note: '' } }, 1) as ImportResult;
  expect(r.doc.entries).toEqual([{ ex: 'legext', sets: [{ kg: 56, reps: 15 }] }]); expect(r.dropped).toBe(0);
});
it('import: planned reps fill gaps when a snapshot exists', () => {
  const r = importStrength(la, D0(), { squat: { kg: 110, reps: 6, sets: 3, note: '' } }, 1) as ImportResult;
  expect(r.doc.entries[0].sets[0]).toEqual({ kg: 110, reps: 6, est: ['reps'] });
});
it('import: idempotent and owner wins', () => {
  const r = importStrength(la, D0(), null, 1) as ImportResult;
  expect(importStrength(la, { ...D0(), workouts: { [r.docId]: r.doc } }, null, 2)).toEqual({ skip: 'already', docId: r.docId, dropped: 0 });
  const typed = { ...r.doc, source: undefined, garminIds: undefined };
  expect(importStrength(la, { ...D0(), workouts: { [r.docId]: typed } }, null, 2)).toEqual({ skip: 'owner-doc' });
});
it('import: a second activity for the same session merges', () => {
  const first = importStrength(la, D0(), null, 1) as ImportResult;
  const r = importStrength({ ...la, activityId: '9', sets: la.sets.slice(0, 2) }, { ...D0(), workouts: { [first.docId]: first.doc } }, null, 2) as ImportResult;
  expect(r.merged).toBe(true); expect(r.doc.garminIds).toEqual(['25193624779', '9']);
  expect(r.doc.entries[0].sets).toHaveLength(4);
});
it('sessionOf: truncated names, voting, ties', () => {
  expect(sessionOf({ ...ub, name: 'Viking Upper B · deload (Fri 20' })).toBe('UB');
  expect(sessionOf({ ...la, name: 'Strength' })).toBe('LA');
  expect(sessionOf({ ...la, name: 'Strength', sets: la.sets.slice(0, 1) })).toBeNull();
});
});
