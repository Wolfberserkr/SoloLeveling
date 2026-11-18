import { describe, expect, it } from 'vitest';
import { zonedTime } from '../supabase/functions/_shared/lifeLogic';
import { bookEvent, moveEvent, removeEvents, type Bridge, type BookSpec, type NewEvent } from '../supabase/functions/_shared/booking';
import type { CalEvent } from '../supabase/functions/_shared/scheduling';

const TZ = 'America/Aruba';
const at = (date: string, time: string) => zonedTime(date, time, TZ);
const J = '0b6f7c2e-3d4a-4e5f-8a9b-1c2d3e4f5a6b';

function fakeBridge(opts: { failCreateAt?: number; failRemove?: string[] } = {}) {
  const created: Array<NewEvent & { id: string }> = [], removed: string[] = [], updated: Array<{ id: string; patch: Partial<NewEvent> }> = [];
  let n = 0;
  const b: Bridge = {
    list: async () => [],
    create: async (e) => {
      n++;
      if (n === opts.failCreateAt) throw new Error('bridge timeout');
      const id = `ev${n}`;
      created.push({ ...e, id });
      return { id };
    },
    update: async (id, patch) => { updated.push({ id, patch }); return { id }; },
    remove: async (id) => { if (opts.failRemove?.includes(id)) throw new Error('nope'); removed.push(id); },
  };
  return { b, created, removed, updated };
}

const spec = (o: Partial<BookSpec> = {}): BookSpec => ({
  jobId: J, kind: 'medical', title: 'Dentist', start: at('2026-11-24', '10:00'), end: at('2026-11-24', '11:00'), allDay: false,
  location: 'Oranjestad', notes: null, remindersMin: [1440, 120], travelMinutes: 20, ...o,
});

describe('bookEvent', () => {
  it('books main event plus two travel blocks', async () => {
    const f = fakeBridge();
    const r = await bookEvent(f.b, spec());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ids).toHaveLength(3);
    const main = f.created.find((e) => e.id === r.ids[0])!;
    expect(main.title).toBe('🩺 Dentist');
    expect(main.description).toBe(`[jarvis] medical · jid:${J}`);
    expect(main.remindersMin).toEqual([1440, 120]);
    expect(main.location).toBe('Oranjestad');
    const travel = f.created.filter((e) => e.title === '🚗 Travel').sort((a, b) => a.start.localeCompare(b.start));
    expect(travel.map((t) => [t.start, t.end])).toEqual([
      [at('2026-11-24', '09:40').toISOString(), at('2026-11-24', '10:00').toISOString()],
      [at('2026-11-24', '11:00').toISOString(), at('2026-11-24', '11:20').toISOString()],
    ]);
    expect(travel.every((t) => t.description === `[jarvis] travel · jid:${J}` && t.remindersMin.length === 0)).toBe(true);
    expect(r.created.map((c) => c.id).sort()).toEqual([...r.ids].sort());
  });

  it('no travel blocks when travelMinutes is 0', async () => {
    const f = fakeBridge();
    const r = await bookEvent(f.b, spec({ travelMinutes: 0 }));
    expect(r.ok && r.ids.length).toBe(1);
    expect(f.created).toHaveLength(1);
  });

  it('rolls back created events when any create fails', async () => {
    const f = fakeBridge({ failCreateAt: 2 });
    const r = await bookEvent(f.b, spec());
    expect(r).toEqual({ ok: false, error: 'bridge timeout' });
    expect(f.removed.sort()).toEqual(f.created.map((c) => c.id).sort());
    expect(f.created.length).toBeGreaterThan(0);
  });
});

describe('removeEvents', () => {
  it('removeEvents reports failures but tries all', async () => {
    const f = fakeBridge({ failRemove: ['b'] });
    expect(await removeEvents(f.b, ['a', 'b', 'c'])).toEqual({ ok: false, failed: ['b'] });
    expect(f.removed).toEqual(['a', 'c']);
  });
});

describe('moveEvent', () => {
  const iso = (t: string) => at('2026-11-24', t).toISOString();
  const main: CalEvent = { id: 'm', title: '🩺 Dentist', start: iso('10:00'), end: iso('11:00'), allDay: false, description: `[jarvis] medical · jid:${J}` };
  const before: CalEvent = { id: 't1', title: '🚗 Travel', start: iso('09:40'), end: iso('10:00'), allDay: false, description: `[jarvis] travel · jid:${J}` };
  const after: CalEvent = { id: 't2', title: '🚗 Travel', start: iso('11:00'), end: iso('11:20'), allDay: false, description: `[jarvis] travel · jid:${J}` };

  it('moveEvent shifts travel blocks with the event', async () => {
    const f = fakeBridge();
    const r = await moveEvent(f.b, { main, travel: [after, before] }, at('2026-11-24', '14:00'), at('2026-11-24', '15:30'));
    expect(r.ok).toBe(true);
    const byId = Object.fromEntries(f.updated.map((u) => [u.id, [u.patch.start, u.patch.end]]));
    expect(byId).toEqual({ m: [iso('14:00'), iso('15:30')], t1: [iso('13:40'), iso('14:00')], t2: [iso('15:30'), iso('15:50')] });
  });
});
