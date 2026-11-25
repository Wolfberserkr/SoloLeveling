import { describe, expect, it } from 'vitest';
import { blockFor, desiredBlocks, reconcile, trainingSlot, type Block, type BlockState } from '../supabase/functions/_shared/viking/calendarPlan.ts';
import type { CalEvent } from '../supabase/functions/_shared/scheduling.ts';
import type { PlanDay } from '../supabase/functions/_shared/viking/planner.ts';

const TZ = 'America/Aruba'; // UTC-4, no DST
const at = (date: string, hm: string) => new Date(`${date}T${hm}:00-04:00`);
const D = '2026-11-26';
const blk = (key: string, hm: string, date = D, title = '🏋️ Viking Lower A'): Block =>
  ({ date, key, title, start: at(date, hm).toISOString(), end: at(date, `${String(+hm.slice(0, 2) + 1).padStart(2, '0')}:${hm.slice(3)}`).toISOString(), overlaps: false });
const ev = (id: string, date: string, hm: string, title = '🏋️ Viking Lower A', description = `[jarvis] training · viking:${date}`): CalEvent =>
  ({ id, title, start: at(date, hm).toISOString(), end: at(date, `${String(+hm.slice(0, 2) + 1).padStart(2, '0')}:${hm.slice(3)}`).toISOString(), allDay: false, description });
const st = (b: Block, eventId: string): BlockState => ({ eventId, key: b.key, start: b.start, end: b.end });
const range = { from: '2026-11-25', to: '2026-12-01' };
const now = at('2026-11-25', '12:00');

describe('viking calendar', () => {
it('blockFor: gym and ride keys, titles, ride +10', () => {
  expect(blockFor({ date: D, cycleDay: 1, kind: 'gym', session: 'LA' })).toEqual({ key: 'gym:LA:60', title: '🏋️ Viking Lower A', minutes: 60 });
  expect(blockFor({ date: D, cycleDay: 2, kind: 'ride', ride: { code: 'E1', minutes: 75 } })).toEqual({ key: 'ride:E1:85', title: '🚴 Viking E1 · Endurance 75 min', minutes: 85 });
  expect(blockFor({ date: D, cycleDay: 3, kind: 'rest' })).toBeNull();
});

it('desiredBlocks: skips rest days, places others', () => {
  const days: PlanDay[] = [
    { date: D, cycleDay: 1, kind: 'gym', session: 'LA' },
    { date: '2026-11-27', cycleDay: 2, kind: 'rest' },
  ];
  const out = desiredBlocks(days, { [D]: '06:00–11:00' }, TZ, []);
  expect(out).toHaveLength(1);
  expect(out[0].start).toBe(at(D, '06:00').toISOString());
  expect(out[0].end).toBe(at(D, '07:00').toISOString());
});

it('slot: first free time inside the window', () => {
  const busy = [{ start: at(D, '06:00'), end: at(D, '07:10') }];
  const s = trainingSlot(D, '06:00–11:00', 60, TZ, busy);
  expect(s.start.toISOString()).toBe(at(D, '07:15').toISOString());
  expect(s.end.toISOString()).toBe(at(D, '08:15').toISOString());
  expect(s.overlaps).toBe(false);
});

it('slot: text window → 16:30', () => {
  const s = trainingSlot(D, 'after work', 60, TZ, []);
  expect(s.start.toISOString()).toBe(at(D, '16:30').toISOString());
  expect(s.overlaps).toBe(false);
});

it('slot: nothing free → window start, overlaps true', () => {
  const busy = [{ start: at(D, '05:00'), end: at(D, '12:00') }];
  const s = trainingSlot(D, '06:00–11:00', 60, TZ, busy);
  expect(s.start.toISOString()).toBe(at(D, '06:00').toISOString());
  expect(s.overlaps).toBe(true);
});

it('reconcile: same key leaves an owner-moved event alone', () => {
  const want = blk('gym:LA:60', '07:00');
  const stored = st(want, 'e1');
  const ops = reconcile([want], { [D]: stored }, [ev('e1', D, '09:00')], now, range);
  expect(ops.create).toEqual([]);
  expect(ops.update).toEqual([]);
  expect(ops.remove).toEqual([]);
  expect(ops.state[D]).toEqual(stored);
});

it('reconcile: changed key updates the stored event; missing event is recreated', () => {
  const old = blk('gym:LA:60', '07:00');
  const want = blk('ride:E1:85', '07:00', D, '🚴 Viking E1 · Endurance 75 min');
  const upd = reconcile([want], { [D]: st(old, 'e1') }, [ev('e1', D, '07:00')], now, range);
  expect(upd.update).toEqual([{ id: 'e1', block: want }]);
  expect(upd.create).toEqual([]);
  expect(upd.state[D]).toEqual({ eventId: 'e1', key: 'ride:E1:85', start: want.start, end: want.end });
  const re = reconcile([want], { [D]: st(old, 'e1') }, [], now, range);
  expect(re.create).toEqual([want]);
  expect(re.update).toEqual([]);
  expect(re.state[D]).toEqual({ eventId: '', key: 'ride:E1:85', start: want.start, end: want.end });
});

it('reconcile: an unplanned future date is removed, a past one is kept', () => {
  const fut = blk('gym:LA:60', '07:00', '2026-11-27');
  const past = blk('gym:UA:60', '07:00', '2026-11-25');
  const state = { '2026-11-27': st(fut, 'f1'), '2026-11-25': st(past, 'p1') };
  const ops = reconcile([], state, [ev('f1', '2026-11-27', '07:00'), ev('p1', '2026-11-25', '07:00')], now, range);
  expect(ops.remove).toEqual(['f1']);
  expect(ops.state['2026-11-27']).toBeUndefined();
  expect(ops.state['2026-11-25']).toEqual(state['2026-11-25']);
});

it('reconcile: adopts a live viking:<date> event with no state; ignores foreign events', () => {
  const want = blk('gym:LA:60', '07:00');
  const live = ev('e9', D, '07:00');
  const foreign = ev('x1', D, '07:00', 'my own gym note', 'bring towel');
  const ops = reconcile([want], {}, [foreign, live], now, range);
  expect(ops.create).toEqual([]);
  expect(ops.update).toEqual([]);
  expect(ops.state[D]).toEqual({ eventId: 'e9', key: 'gym:LA:60', start: live.start, end: live.end });
  const moved = reconcile([want], {}, [foreign, ev('e9', D, '09:00')], now, range);
  expect(moved.update).toEqual([{ id: 'e9', block: want }]);
  expect(JSON.stringify(ops)).not.toContain('x1');
  expect(JSON.stringify(moved)).not.toContain('x1');
});
});
