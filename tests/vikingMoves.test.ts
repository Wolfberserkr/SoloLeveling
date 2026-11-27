import { describe, expect, it } from 'vitest';
import { dn, emptyData, iso, type CycleDoc, type VikingData } from '../supabase/functions/_shared/viking/logic.ts';
import { lap } from '../supabase/functions/_shared/viking/bikeLogic.ts';
import { nextSync, resolveMoves, skipTicks, swapDays } from '../supabase/functions/_shared/viking/moves.ts';

const START = '2026-01-05';
function data(over: Partial<VikingData> = {}): VikingData {
  return { ...emptyData(), settings: { startDate: START, startWeight: 102, phaseMode: 'auto', kcalAdjust: 0 }, ...over };
}
const day = (offset: number) => iso(dn(START) + offset);
const tick = (date: string, d: number, savedAt = 0, status: CycleDoc['status'] = 'done'): CycleDoc => ({ date, day: d, status, savedAt });
const sortedTicks = (D: VikingData) =>
  Object.values(D.cycle).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.savedAt - b.savedAt));

describe('viking moves', () => {
it('vks skip ticks sort after the latest tick and fill only open boxes', () => {
  const D = data({ cycle: { a: tick(day(0), 1, 1), b: tick(day(1), 2, 2), c: tick(day(2), 4, 10) } });
  const out = skipTicks(D, day(2), [3], 5);
  expect(out).toHaveLength(1);
  expect(out[0].id).toBe(`${day(2)}_auto_3`);
  expect(out[0].doc).toMatchObject({ date: day(2), day: 3, status: 'skip' });
  expect(out[0].doc.savedAt).toBeGreaterThan(10);
  const after: VikingData = { ...D, cycle: { ...D.cycle, [out[0].id]: out[0].doc } };
  const l = lap(sortedTicks(after));
  expect(l.boxes.find((b) => b.status === 'open')?.day).toBe(5);
  expect(l.boxes.filter((b) => b.status !== 'open').map((b) => b.day)).toEqual([1, 2, 3, 4]);
  expect(skipTicks(D, day(2), [4], 5)).toEqual([]);
});
it('skipTicks: dated the latest tick when the swap is older', () => {
  const D = data({ cycle: { a: tick(day(0), 1, 1), b: tick(day(1), 4, 2), c: tick(day(3), 2, 3) } });
  const out = skipTicks(D, day(1), [3], 1);
  expect(out.map((t) => t.doc)).toEqual([{ date: day(3), day: 3, status: 'skip', savedAt: 4 }]);
});
it('swapDays: open days before the swap box, still in the current lap', () => {
  const D = data({ cycle: { a: tick(day(0), 1, 1), b: tick(day(1), 2, 2), c: tick(day(2), 5, 3) } });
  expect(swapDays(D, day(2), 'LB')).toEqual([3, 4]);
  expect(swapDays(D, day(1), 'LB')).toEqual([]); // that session wasn't on this date
  // A ride swap passes gym boxes only.
  const R = data({ cycle: { a: tick(day(0), 1, 1), b: tick(day(1), 6, 2) } });
  expect(swapDays(R, day(1))).toEqual([2, 4, 5]);
  expect(swapDays(R, day(0))).toEqual([]);
});

it('resolveMoves: swap today and tomorrow', () => {
  // ticks 1, 2 → today plans 3 (H1), tomorrow 4 (UB).
  const D = data({ cycle: { a: tick(day(0), 1), b: tick(day(1), 2) } });
  const r = resolveMoves(D, {}, [{ what: 'UB', date: day(2) }, { what: 'H1', date: day(3) }], day(2));
  expect(r).toEqual({ pins: { [day(2)]: 4, [day(3)]: 3 }, errors: [] });
});
it('resolveMoves: a box gets one date and a date one box, newest wins', () => {
  const D = data({ cycle: { a: tick(day(0), 1), b: tick(day(1), 2) } });
  const r = resolveMoves(D, { [day(4)]: 4, [day(5)]: 3 }, [{ what: '4', date: day(3) }, { what: 'LB', date: day(5) }], day(2));
  expect(r).toEqual({ pins: { [day(3)]: 4, [day(5)]: 5 }, errors: [] });
});
it('resolveMoves: refuses a session done this lap', () => {
  const D = data({ cycle: { a: tick(day(0), 1), b: tick(day(1), 2), c: tick(day(2), 3), d: tick(day(3), 4) } });
  const r = resolveMoves(D, { [day(5)]: 6 }, [{ what: 'UA', date: day(5) }], day(4));
  expect(r.errors).toEqual(['Upper A is done this lap; next is Lower B']);
  expect(r.pins).toEqual({ [day(5)]: 6 });
});
it('resolveMoves: a next-lap box is allowed once the preview starts that lap', () => {
  const D = data({ cycle: { a: tick(day(0), 1), b: tick(day(1), 2), c: tick(day(2), 3), d: tick(day(3), 4) } });
  // Open 5–8 fill day 4–7, the next lap starts on day 8.
  expect(resolveMoves(D, {}, [{ what: 'UA', date: day(8) }], day(4))).toEqual({ pins: { [day(8)]: 1 }, errors: [] });
});
it('resolveMoves: refuses dates outside the window', () => {
  const D = data({ cycle: { a: tick(day(0), 1) } });
  const r = resolveMoves(D, {}, [{ what: 'LA', date: day(9) }, { what: 'LA', date: day(1) }], day(2));
  expect(r.errors).toEqual([`Dates must be today to ${day(8)}`, `Dates must be today to ${day(8)}`]);
  expect(r.pins).toEqual({});
});
it('resolveMoves: unknown day and unplanned ride code', () => {
  const D = data({ cycle: { a: tick(day(0), 1) } });
  const r = resolveMoves(D, {}, [{ what: 'XX', date: day(2) }, { what: 'H3', date: day(2) }], day(2));
  expect(r.errors).toEqual([
    'Unknown day "XX": use UA, LA, UB, LB, a ride code, off or 1–8',
    'No H3 ride is planned in the next 7 days',
  ]);
});
it('resolveMoves: off replaces a pin on that date', () => {
  const D = data({ cycle: { a: tick(day(0), 1) } });
  const r = resolveMoves(D, { [day(3)]: 4 }, [{ what: 'off', date: day(3) }], day(2));
  expect(r).toEqual({ pins: { [day(3)]: 0 }, errors: [] });
});
it('resolveMoves: clear empties pins', () => {
  const D = data({ cycle: { a: tick(day(0), 1) } });
  expect(resolveMoves(D, { [day(3)]: 4, [day(4)]: 0 }, [], day(2), true)).toEqual({ pins: {}, errors: [] });
});

it('nextSync: :12 past every third UTC hour, local, strictly after now', () => {
  const tz = 'America/Aruba';
  expect(nextSync(Date.parse('2026-11-27T13:00:00Z'), tz)).toBe('11:12'); // 15:12 UTC
  expect(nextSync(Date.parse('2026-11-27T15:12:00Z'), tz)).toBe('14:12'); // 18:12 UTC
  expect(nextSync(Date.parse('2026-11-27T22:00:00Z'), tz)).toBe('20:12'); // 00:12 UTC next day
});
});
