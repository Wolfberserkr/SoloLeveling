import { describe, expect, it } from 'vitest';
import {
  advanceDue, billsToFlag, budgetStatus, categorise, DEFAULT_PREFS, formatMoney, isConfidentQuickLog, isDue,
  localParts, parseQuickLog, planDay, readPrefs, shiftKind, stepsNudge, toAwgMinor, windDownAt, zonedTime, hhmm,
} from '../supabase/functions/_shared/lifeLogic';

const TZ = 'America/Aruba'; // UTC-4, no DST
const at = (date: string, time: string) => zonedTime(date, time, TZ);
const shift = (date: string, start: string, end: string, endDate = date) => ({ startsAt: at(date, start), endsAt: at(endDate, end) });

describe('money', () => {
  it('converts USD to AWG at the 1.79 peg', () => {
    expect(toAwgMinor(-1000, 'USD')).toBe(-1790);
    expect(toAwgMinor(2500, 'AWG')).toBe(2500);
    expect(toAwgMinor(100, 'EUR')).toBeNull();
  });

  it('formats both currencies', () => {
    expect(formatMoney(-2550, 'AWG')).toBe('-ƒ25.50');
    expect(formatMoney(1200, 'USD')).toBe('$12.00');
  });

  it('parses one-line spends', () => {
    expect(parseQuickLog('25 lunch')).toEqual({ amountMinor: -2500, currency: 'AWG', description: 'lunch', category: 'dining' });
    expect(parseQuickLog('$12.50 netflix')).toMatchObject({ amountMinor: -1250, currency: 'USD', category: 'subscriptions' });
    expect(parseQuickLog('usd 40 gas')).toMatchObject({ amountMinor: -4000, currency: 'USD', category: 'fuel' });
    expect(parseQuickLog('40usd gas')).toMatchObject({ amountMinor: -4000, currency: 'USD' });
    expect(parseQuickLog('afl 30,5 groceries')).toMatchObject({ amountMinor: -3050, currency: 'AWG', category: 'groceries' });
    expect(parseQuickLog('+2500 salary')).toMatchObject({ amountMinor: 250000, category: 'income' });
    expect(parseQuickLog('+300 sold old bike')).toMatchObject({ amountMinor: 30000 });
  });

  it('refuses things that are not spends', () => {
    expect(parseQuickLog('25')).toBeNull();
    expect(parseQuickLog('what did I spend?')).toBeNull();
    expect(parseQuickLog('0 lunch')).toBeNull();
  });

  it('only fast-paths unmistakable money lines', () => {
    const t = '3 things I need to do today';
    expect(isConfidentQuickLog(t, parseQuickLog(t))).toBe(false);
    expect(isConfidentQuickLog('25 lunch', parseQuickLog('25 lunch'))).toBe(true);
    expect(isConfidentQuickLog('15 stuff', parseQuickLog('15 stuff'))).toBe(false);
    expect(isConfidentQuickLog('$15 stuff', parseQuickLog('$15 stuff'))).toBe(true);
  });

  it('categorises on word boundaries', () => {
    expect(categorise('Las Vegas trip')).toBe('uncategorised'); // not "gas"
    expect(categorise('bowling night')).toBe('uncategorised');  // not groceries
    expect(categorise('Valero station')).toBe('fuel');
    expect(categorise('SETAR mobile')).toBe('utilities');
  });

  it('grades budgets at 80% and 100%', () => {
    expect(budgetStatus(7900, 10000).level).toBe('ok');
    expect(budgetStatus(8000, 10000)).toEqual({ pct: 80, level: 'warn' });
    expect(budgetStatus(10500, 10000).level).toBe('over');
  });

  it('advances due dates and clamps month ends', () => {
    expect(advanceDue('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(advanceDue('2026-11-15', 'quarterly')).toBe('2027-02-15');
    expect(advanceDue('2028-02-29', 'yearly')).toBe('2029-02-28');
    expect(advanceDue('2026-12-29', 'weekly')).toBe('2027-01-05');
    expect(advanceDue('2026-12-29', 'once')).toBeNull();
  });

  it('flags bills 3 days, 1 day and on the day, plus overdue non-autopay', () => {
    const bills = [
      { name: 'rent', next_due: '2026-11-15', amount_minor: 100000, currency: 'AWG', autopay: false },
      { name: 'netflix', next_due: '2026-11-14', amount_minor: 1500, currency: 'USD', autopay: true },
      { name: 'elmar', next_due: '2026-11-10', amount_minor: 20000, currency: 'AWG', autopay: false },
      { name: 'gym', next_due: '2026-11-10', amount_minor: 5000, currency: 'AWG', autopay: true },
      { name: 'web', next_due: '2026-11-14', amount_minor: 5000, currency: 'AWG', autopay: false },
    ];
    expect(billsToFlag(bills, '2026-11-12').map((b) => b.name)).toEqual(['elmar', 'rent']);
    // Overdue and unpaid keeps nagging daily until it's marked paid.
    expect(billsToFlag(bills, '2026-11-13').map((b) => b.name)).toEqual(['elmar', 'netflix', 'web']);
  });
});

describe('time', () => {
  it('converts local wall clock to UTC', () => {
    expect(at('2026-11-12', '05:00').toISOString()).toBe('2026-11-12T09:00:00.000Z');
    expect(localParts(new Date('2026-11-13T02:30:00Z'), TZ)).toMatchObject({ date: '2026-11-12', hour: 22, minute: 30 });
  });

  it('handles DST zones', () => {
    // Amsterdam switches on 2026-03-29: 01:00 UTC offset before, 02:00 after.
    expect(zonedTime('2026-03-28', '09:00', 'Europe/Amsterdam').toISOString()).toBe('2026-03-28T08:00:00.000Z');
    expect(zonedTime('2026-03-30', '09:00', 'Europe/Amsterdam').toISOString()).toBe('2026-03-30T07:00:00.000Z');
  });

  it('classifies the three shifts from the bike plan', () => {
    expect(shiftKind(at('2026-11-12', '05:00'), TZ)).toBe('morning');
    expect(shiftKind(at('2026-11-12', '13:00'), TZ)).toBe('mid');
    expect(shiftKind(at('2026-11-12', '21:00'), TZ)).toBe('night');
  });

  it('isDue opens at the time and closes after the slack', () => {
    const t = at('2026-11-12', '20:00');
    expect(isDue(t, new Date(t.getTime() - 60000))).toBe(false);
    expect(isDue(t, t)).toBe(true);
    expect(isDue(t, new Date(t.getTime() + 19 * 60000))).toBe(true);
    expect(isDue(t, new Date(t.getTime() + 20 * 60000))).toBe(false);
  });
});

describe('day plan', () => {
  const P = DEFAULT_PREFS;

  it('morning shift: wake 90 min before, 8 h sleep before that, brief 30 min before leaving', () => {
    const p = planDay('2026-11-12', shift('2026-11-12', '05:00', '14:00'), undefined, P, TZ);
    expect(p.kind).toBe('morning');
    expect(hhmm(p.wakeAt, TZ)).toBe('03:30');
    expect(hhmm(p.bedAt, TZ)).toBe('19:30');
    expect(hhmm(p.briefingAt, TZ)).toBe('04:30');
    expect(p.trainWindow).toBe('16:30–18:30'); // matches the bike plan's window
    expect(hhmm(windDownAt(p, P), TZ)).toBe('18:45');
  });

  it('mid shift after a late shift sleeps in', () => {
    const prev = shift('2026-11-11', '13:00', '22:00');
    const p = planDay('2026-11-12', shift('2026-11-12', '13:00', '22:00'), prev, P, TZ);
    expect(p.kind).toBe('mid');
    expect(hhmm(p.bedAt, TZ)).toBe('23:30');
    expect(hhmm(p.wakeAt, TZ)).toBe('07:30');
    expect(hhmm(p.briefingAt, TZ)).toBe('08:30');
  });

  it('mid shift never lets you wake too close to leaving', () => {
    const prefs = readPrefs({ offDayWake: '11:00' });
    const p = planDay('2026-11-12', shift('2026-11-12', '13:00', '22:00'), undefined, prefs, TZ);
    expect(hhmm(p.wakeAt, TZ)).toBe('09:30'); // 13:00 − 90 min prep − 2 h
  });

  it('first night shift gets an afternoon nap', () => {
    const p = planDay('2026-11-12', shift('2026-11-12', '21:00', '05:00', '2026-11-13'), undefined, P, TZ);
    expect(p.kind).toBe('night');
    expect(hhmm(p.napFrom!, TZ)).toBe('15:00');
    expect(hhmm(p.napTo!, TZ)).toBe('17:30');
  });

  it('back-to-back nights sleep straight after the shift', () => {
    const prev = shift('2026-11-11', '21:00', '05:00', '2026-11-12');
    const p = planDay('2026-11-12', shift('2026-11-12', '21:00', '05:00', '2026-11-13'), prev, P, TZ);
    expect(hhmm(p.bedAt, TZ)).toBe('06:00');
    expect(hhmm(p.wakeAt, TZ)).toBe('13:00');
    expect(p.napFrom).toBeUndefined();
  });

  it('off day after nights: anchor sleep, then easy training only', () => {
    const prev = shift('2026-11-11', '21:00', '05:00', '2026-11-12');
    const p = planDay('2026-11-12', undefined, prev, P, TZ);
    expect(p.kind).toBe('off');
    expect(hhmm(p.bedAt, TZ)).toBe('06:00');
    expect(hhmm(p.wakeAt, TZ)).toBe('11:00');
    expect(p.trainWindow).toMatch(/easy/);
  });

  it('plain off day uses the fixed briefing time', () => {
    const p = planDay('2026-11-14', undefined, shift('2026-11-13', '05:00', '14:00'), P, TZ);
    expect(hhmm(p.wakeAt, TZ)).toBe('07:30');
    expect(hhmm(p.briefingAt, TZ)).toBe('08:30');
  });

  it('readPrefs ignores junk and keeps defaults', () => {
    expect(readPrefs({ sleepHours: 99, offDayWake: '7am', stepTarget: '12000' })).toEqual({ ...DEFAULT_PREFS, stepTarget: 12000 });
  });
});

describe('nudges', () => {
  it('steps nudge only in the evening, only when well short, never at work', () => {
    expect(stepsNudge(4000, 10000, 18, false)).toMatch(/6,000 short/);
    expect(stepsNudge(4000, 10000, 14, false)).toBeNull();
    expect(stepsNudge(7000, 10000, 18, false)).toBeNull();
    expect(stepsNudge(4000, 10000, 18, true)).toBeNull();
    expect(stepsNudge(undefined, 10000, 18, false)).toBeNull();
  });
});
