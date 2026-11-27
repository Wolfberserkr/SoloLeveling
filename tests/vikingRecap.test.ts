import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyData, type VikingData } from '../supabase/functions/_shared/viking/logic.ts';
import { importStrength, type GarminIn, type ImportResult } from '../supabase/functions/_shared/viking/garminImport.ts';
import type { Progress } from '../supabase/functions/_shared/viking/targets.ts';
import {
  confirmKeyboard, confirmReps, newLapLine, recapText, resultFromDoc, rideSwapText, skipKeyboard, suggestionKeyboard,
  swapLine,
} from '../supabase/functions/_shared/viking/recap.ts';

const load = (f: string) => JSON.parse(readFileSync(`tests/fixtures/${f}`, 'utf8')) as GarminIn;
const la = load('garmin-2026-11-25-lower-a.json'), ub = load('garmin-2026-11-20-upper-b-deload.json');
const D0 = () => ({ ...emptyData(), settings: { startDate: '2026-10-10', startWeight: 102, phaseMode: 'auto', kcalAdjust: 0 } }) as VikingData;
const P = (kg: number | null, o: Partial<Progress> = {}): Progress =>
  ({ kg, reps: 5, sets: 3, note: '', stalled: false, lastTop: kg, repsUnknown: false, ...o });
const LA = () => importStrength(la, D0(), null, 1) as ImportResult;

describe('viking recap', () => {
it('recapText: reps not counted → targets stay, no Next time', () => {
  const t = recapText(LA(), { squat: P(110) }, { squat: P(110, { repsUnknown: true }) }, null, null);
  expect(t).toContain('Lower A saved');
  expect(t).toContain('Wed 25 Nov');
  expect(t).toContain('Back squat: reps not recorded, assumed 5');
  expect(t).toContain('targets stay');
  expect(t).toContain('Reps weren\'t counted on 1 exercise,');
  expect(t).toContain('Reply e.g. "Back squat 3×6" if you did more.');
  expect(t).not.toContain('Next time');
  expect(t).not.toContain('Swapped');
  expect(t).not.toContain('New lap');
});
it('recapText: weights that go up are listed', () => {
  const t = recapText(LA(), { squat: P(110), lycurl: P(54) }, { squat: P(110), lycurl: P(55) }, null, null);
  expect(t).toContain('Next time: Lying leg curl 54→55 kg');
  expect(t).not.toContain('Back squat 110');
});
it('swapLine, rideSwapText, newLapLine: the exact copy', () => {
  expect(swapLine([3], 'tomorrow')).toBe('↔️ Swapped: Hard ride moves to tomorrow.');
  expect(swapLine([6, 7], 'Sun 29 Nov')).toBe('↔️ Swapped: Endurance ride moves to Sun 29 Nov.');
  expect(rideSwapText('2026-11-25', 'LA', 6))
    .toBe('↔️ You rode on Wed 25 Nov instead of Lower A: the ride counts as day 6, and Lower A is next.');
  expect(newLapLine('UA', [3, 5, 6, 7, 8]))
    .toBe('🔄 New lap: Upper A started it, so Hard ride, Lower B, Endurance ride and 2 more were passed.');
  expect(newLapLine('UA', [5, 7, 8])).toBe('🔄 New lap: Upper A started it, so Lower B, Ride and Rest day were passed.');
  expect(newLapLine('UB', [8])).toBe('🔄 New lap: Upper B started it, so Rest day was passed.');
  expect(newLapLine('UB', [])).toBe('🔄 New lap: Upper B started it.');
});
it('recapText: the swap and new-lap lines', () => {
  const t = recapText(LA(), {}, {}, { early: [1], to: 'tomorrow' }, null);
  expect(t.split('\n').at(-1)).toBe('↔️ Swapped: Upper A moves to tomorrow.');
  expect(recapText(LA(), {}, {}, { early: [], to: 'tomorrow' }, null)).not.toContain('Swapped');
  expect(recapText(LA(), {}, {}, null, [3, 4]).split('\n').at(-1))
    .toBe('🔄 New lap: Lower A started it, so Hard ride and Upper B were passed.');
});
it('skipKeyboard: one button per day (at most 3), all from two days', () => {
  expect(skipKeyboard('25193624779', [])).toBeNull();
  expect(skipKeyboard('25193624779', [3])).toEqual([[{ text: '✖️ Skip Hard ride', data: 'vks:25193624779:3' }]]);
  expect(skipKeyboard('r2026-11-25', [2, 3, 4, 5])).toEqual([
    [{ text: '✖️ Skip Lower A', data: 'vks:r2026-11-25:2' }],
    [{ text: '✖️ Skip Hard ride', data: 'vks:r2026-11-25:3' }],
    [{ text: '✖️ Skip Upper B', data: 'vks:r2026-11-25:4' }],
    [{ text: '✖️ Skip all', data: 'vks:r2026-11-25:all' }],
  ]);
});
it('confirmKeyboard: one row per exercise with assumed reps, then all', () => {
  const kb = confirmKeyboard(LA(), '25193624779')!;
  expect(kb[0]).toEqual([{ text: '✅ Back squat as planned', data: 'vr:25193624779:squat' }]);
  expect(kb[kb.length - 1]).toEqual([{ text: '✅ All as planned', data: 'vr:25193624779:all' }]);
  const many = importStrength(ub, D0(), null, 1) as ImportResult; // every rep null
  expect(confirmKeyboard(many, 'x')!.length).toBeLessThanOrEqual(5);
  const counted = { ...LA(), doc: confirmReps(LA().doc, 'all') };
  expect(confirmKeyboard(counted, 'x')).toBeNull();
});
it('confirmReps: drops reps from est on that exercise only, and empty est', () => {
  const doc = confirmReps(LA().doc, 'squat');
  const by = Object.fromEntries(doc.entries.map((e) => [e.ex, e.sets]));
  expect(by.squat).toEqual([0, 1, 2].map(() => ({ kg: 110, reps: 5 })));
  expect(by.crunch).toEqual([{ kg: 0, reps: 15, est: ['kg'] }]);
  const both = confirmReps({ ...LA().doc, entries: [{ ex: 'squat', sets: [{ kg: 0, reps: 5, est: ['kg', 'reps'] }] }] }, 'all');
  expect(both.entries[0].sets[0]).toEqual({ kg: 0, reps: 5, est: ['kg'] });
});
it('resultFromDoc: same assumptions as the import, plus the dropped line', () => {
  const r = importStrength(ub, D0(), null, 1) as ImportResult;
  const back = resultFromDoc(r.doc, r.docId, r.session, null, D0(), r.dropped);
  expect(back).toEqual({ ...r, merged: false });
  expect(back.assumptions).toContain('1 unrecognised set left out');
});
it('suggestionKeyboard: ok and no', () => {
  const kb = suggestionKeyboard({ id: 'squat-2026-11-25', kind: 'reset', ex: 'squat', kg: 100, status: 'pending', createdAt: '' });
  expect(kb).toEqual([[{ text: '✅ Reset', data: 'vk:squat-2026-11-25:ok' }, { text: '✖️ Keep pushing', data: 'vk:squat-2026-11-25:no' }]]);
});
});
