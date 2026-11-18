import { describe, expect, it } from 'vitest';
import { zonedTime } from '../supabase/functions/_shared/lifeLogic';
import {
  bookedText, busyFromEvents, eventTitle, isJarvis, jarvisDescription, jobIdOf, matchJarvisEvents, offerExpired,
  pickSlots, slotLabel, type CalEvent, type SlotOpts,
} from '../supabase/functions/_shared/scheduling';

const TZ = 'America/Aruba'; // UTC-4, no DST
const at = (date: string, time: string) => zonedTime(date, time, TZ);
const win = (date: string, from: string, to: string) => ({ start: at(date, from), end: at(date, to) });
const J = '0b6f7c2e-3d4a-4e5f-8a9b-1c2d3e4f5a6b';
const THU = '2026-11-19', FRI = '2026-11-20';
const base = (o: Partial<SlotOpts> = {}): SlotOpts => ({ minutes: 60, travelMinutes: 0, outdoor: false, tz: TZ, now: at('2026-11-18', '08:00'), offDays: new Set(), ...o });
const labels = (xs: { start: Date }[]) => xs.map((x) => slotLabel({ start: x.start, end: x.start }, TZ));
const ev = (o: Partial<CalEvent>): CalEvent => ({ id: 'e1', title: 'X', start: at(THU, '10:00').toISOString(), end: at(THU, '11:00').toISOString(), allDay: false, description: '', ...o });

describe('titles and markers', () => {
  it('prefixes the kind emoji once', () => {
    expect(eventTitle('medical', 'Dentist')).toBe('🩺 Dentist');
    expect(eventTitle('medical', '🩺 Dentist')).toBe('🩺 Dentist');
    expect(eventTitle('weird', 'X')).toBe('📅 X');
  });

  it('writes and reads the jarvis marker', () => {
    const d = jarvisDescription('Bring card', 'medical', J);
    expect(d).toBe(`Bring card\n[jarvis] medical · jid:${J}`);
    expect(jarvisDescription(null, 'travel', J)).toBe(`[jarvis] travel · jid:${J}`);
    expect(isJarvis(d)).toBe(true);
    expect(isJarvis('my own event')).toBe(false);
    expect(jobIdOf(d)).toBe(J);
    expect(jobIdOf('no marker')).toBeNull();
  });
});

describe('busyFromEvents', () => {
  it('busyFromEvents skips all-day events', () => {
    const busy = busyFromEvents([ev({ allDay: true, title: 'Holiday' }), ev({ title: 'Lunch' })]);
    expect(busy).toHaveLength(1);
    expect(busy[0].label).toBe('Lunch');
  });
});

describe('pickSlots', () => {
  const ws = [win(THU, '09:00', '12:00'), win(THU, '13:00', '17:00'), win(FRI, '09:00', '12:00')];

  it('pickSlots spreads across days', () => {
    expect(labels(pickSlots(ws, base({ max: 2 })))).toEqual(['Thu 19 Nov 09:00', 'Fri 20 Nov 09:00']);
    expect(labels(pickSlots(ws, base({ max: 3 })))).toEqual(['Thu 19 Nov 09:00', 'Thu 19 Nov 13:00', 'Fri 20 Nov 09:00']);
  });

  it('pickSlots prefers off days', () => {
    expect(labels(pickSlots(ws, base({ max: 1, offDays: new Set([FRI]) })))).toEqual(['Fri 20 Nov 09:00']);
  });

  it('pickSlots rounds and pads for travel', () => {
    expect(labels(pickSlots([win(THU, '09:10', '11:00')], base({ travelMinutes: 20 })))).toEqual(['Thu 19 Nov 09:30']);
    expect(pickSlots([win(THU, '09:10', '10:20')], base({ travelMinutes: 20 }))).toEqual([]);
  });

  it('pickSlots outdoor avoids 11:00–16:00', () => {
    expect(labels(pickSlots([win(THU, '10:00', '18:00')], base({ minutes: 90, outdoor: true })))).toEqual(['Thu 19 Nov 16:00']);
  });

  it('pickSlots never returns past or sleep-overlapping slots', () => {
    const now = at(THU, '20:40');
    expect(labels(pickSlots([win(THU, '20:00', '22:00')], base({ now })))).toEqual(['Thu 19 Nov 21:00']);
    expect(pickSlots([win(THU, '20:00', '21:30')], base({ now }))).toEqual([]);
  });

  it('defaults to three slots', () => {
    expect(pickSlots([...ws, win('2026-11-21', '09:00', '12:00')], base())).toHaveLength(3);
  });
});

describe('offers and labels', () => {
  it('offerExpired after 48 h', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    expect(offerExpired(new Date(now.getTime() - 47 * 3600000), now)).toBe(false);
    expect(offerExpired(new Date(now.getTime() - 49 * 3600000).toISOString(), now)).toBe(true);
  });

  it('slotLabel', () => {
    expect(slotLabel({ start: at(FRI, '14:00'), end: at(FRI, '15:00') }, TZ)).toBe('Fri 20 Nov 14:00');
  });
});

describe('bookedText', () => {
  const e = { title: '🩺 Dentist', start: at('2026-11-24', '10:00'), end: at('2026-11-24', '11:00'), allDay: false, location: 'Oranjestad', travelMinutes: 20, remindersMin: [1440, 120], clashes: [] as string[] };

  it('confirms with time, place, travel and reminders', () => {
    expect(bookedText(e, TZ)).toBe('📅 <b>🩺 Dentist</b> · Tue 24 Nov 10:00–11:00 · Oranjestad\n🚗 20 min travel either side · 🔔 1 day + 2 h before');
  });

  it('adds clashes and escapes html', () => {
    const t = bookedText({ ...e, title: 'A<b>', location: null, travelMinutes: 0, remindersMin: [], clashes: ['overlaps your Mid shift 13:00–22:00'] }, TZ);
    expect(t).toBe('📅 <b>A&lt;b&gt;</b> · Tue 24 Nov 10:00–11:00\n⚠️ overlaps your Mid shift 13:00–22:00');
  });

  it('all-day events show the date only', () => {
    expect(bookedText({ ...e, allDay: true, location: null, travelMinutes: 0, remindersMin: [60] }, TZ)).toBe('📅 <b>🩺 Dentist</b> · Tue 24 Nov (all day)\n🔔 1 h before');
  });
});

describe('matchJarvisEvents', () => {
  const mine = ev({ id: 'a', title: '🩺 Dentist', description: `[jarvis] medical · jid:${J}` });
  const theirs = ev({ id: 'b', title: 'Dentist', description: 'booked by phone' });
  const other = ev({ id: 'c', title: '🩺 Dentist', start: at(FRI, '10:00').toISOString(), end: at(FRI, '11:00').toISOString(), description: '[jarvis] medical' });

  it('matchJarvisEvents ignores events without [jarvis]', () => {
    expect(matchJarvisEvents([mine, theirs], 'dentist', undefined, TZ).map((x) => x.id)).toEqual(['a']);
  });

  it('limits by local date', () => {
    expect(matchJarvisEvents([mine, other], 'Dentist', FRI, TZ).map((x) => x.id)).toEqual(['c']);
    expect(matchJarvisEvents([mine, other], 'dentist', undefined, TZ)).toHaveLength(2);
  });
});
