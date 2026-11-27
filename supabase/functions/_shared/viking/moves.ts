// Project Viking — what the owner changes in the cycle from Telegram: skip
// taps on a swap message and viking_move's pins. Pure: the data, dates and
// clock are passed in.
import { RIDE_CODES, type RideCode } from './bikePlan.ts';
import { bike, cycleDay, dayOfSession, type Box } from './bikeLogic.ts';
import { ORDER, type SessionKey } from './data.ts';
import { viking, type CycleDoc, type VikingData } from './logic.ts';
import { planAhead, planOrder, tickId, type PlanCtx, type Pins } from './planner.ts';
import { dayName } from './recap.ts';
import { addDays, hhmm } from '../lifeLogic.ts';

const HOUR = 3_600_000;
/** The routines' sync: :12 past every third UTC hour (00:12, 03:12, …, 21:12). */
const SYNC_EVERY_H = 3;
const SYNC_MIN = 12;
/** viking_move's window: today … today + 6. */
const WINDOW_DAYS = 7;

const ticksOf = (D: VikingData) => Object.values(D.cycle);

/** The open days a swap passed that are still open: every open box before
 *  the session's own box (gym swap), or every open gym box before the ride
 *  box ticked on `date` (ride swap, no `session`). [] once that box is no
 *  longer the one filled on `date` in the current lap. */
export function swapDays(D: VikingData, date: string, session?: SessionKey): number[] {
  const boxes = bike(viking(D)).lap().boxes;
  const box = session
    ? dayOfSession(session)
    : ticksOf(D).find((t) => t.date === date && t.status === 'done' && !cycleDay(t.day).gym)?.day;
  if (box == null || boxes[box - 1].status !== 'done' || boxes[box - 1].date !== date) return [];
  return boxes.filter((b) => b.day < box && b.status === 'open' && (session || cycleDay(b.day).gym)).map((b) => b.day);
}

/** `skip` ticks for those of `days` whose box is still open. Each is dated
 *  `date` or the latest tick's date, whichever is later, with a savedAt after
 *  every existing tick, so it sorts last and never opens a new lap. */
export function skipTicks(D: VikingData, date: string, days: number[], nowMs: number): Array<{ id: string; doc: CycleDoc }> {
  const ticks = ticksOf(D);
  const boxes = bike(viking(D)).lap().boxes;
  const at = ticks.reduce((m, t) => (t.date > m ? t.date : m), date);
  const savedAt = ticks.reduce((m, t) => Math.max(m, t.savedAt + 1), nowMs);
  return [...new Set(days)]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 8 && boxes[n - 1].status === 'open')
    .sort((a, b) => a - b)
    .map((day, i) => ({ id: tickId(at, day), doc: { date: at, day, status: 'skip' as const, savedAt: savedAt + i } }))
    .filter((t) => !D.cycle[t.id]);
}

/** The current lap as the planner sees it: with no ticks yet, the boxes
 *  before the current day are behind us. */
function lapBoxes(D: VikingData): Box[] {
  const b = bike(viking(D)), boxes = b.lap().boxes;
  if (ticksOf(D).length) return boxes;
  const cur = b.current().day;
  return boxes.map((x) => (x.day < cur ? { ...x, status: 'passed' as const } : x));
}

/**
 * Apply viking_move's moves to the pins. `what` is UA/LA/UB/LB, a ride code
 * (the first planned box riding it), `off` (an extra day off, pin 0) or a
 * cycle day 1–8. A new pin on a date replaces that date's old pin, and a box
 * keeps only its newest date. Each pinned box must land on its date in the
 * 7-day preview: an open box of this lap, or one of the next lap once the
 * preview has started it. Any error leaves the pins as they were.
 */
export function resolveMoves(
  D: VikingData, pins: Pins, moves: Array<{ what: string; date: string }>, today: string, clear = false,
): { pins: Pins; errors: string[] } {
  const last = addDays(today, WINDOW_DAYS - 1);
  const base = (): PlanCtx => ({ today, afterNight: new Set(), overrides: {}, resets: {} });
  let plain: ReturnType<typeof planAhead> | null = null;
  const errors: string[] = [];
  const out: Pins = clear ? {} : { ...pins };
  const placed: Array<{ date: string; day: number }> = [];

  for (const m of moves) {
    const date = String(m.date ?? '').trim(), raw = String(m.what ?? '').trim(), what = raw.toUpperCase();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > last) { errors.push(`Dates must be today to ${last}`); continue; }
    let day: number | null = null;
    if (what === 'OFF') day = 0;
    else if (/^[1-8]$/.test(what)) day = Number(what);
    else if (ORDER.includes(what as SessionKey)) day = dayOfSession(what as SessionKey);
    else if (RIDE_CODES.includes(what as RideCode)) {
      plain ??= planAhead(D, base());
      const hit = plain.find((p) => p.ride && (p.ride.code === what || p.ride.from === what));
      if (!hit) { errors.push(`No ${what} ride is planned in the next ${WINDOW_DAYS} days`); continue; }
      day = hit.cycleDay;
    } else { errors.push(`Unknown day "${raw}": use UA, LA, UB, LB, a ride code, off or 1–8`); continue; }
    if (day > 0) for (const [d, p] of Object.entries(out)) if (p === day && d !== date) delete out[d];
    out[date] = day;
    if (day > 0) placed.push({ date, day });
  }

  if (!errors.length && placed.length) {
    const order = planOrder(D, { ...base(), pins: out });
    const boxes = lapBoxes(D);
    const next = boxes.find((b) => b.status === 'open')?.day ?? 1;
    for (const { date, day } of placed) {
      if (out[date] !== day || order.some((s) => s.date === date && s.day === day)) continue;
      errors.push(boxes[day - 1].status !== 'open'
        ? `${dayName(day)} is done this lap; next is ${dayName(next)}`
        : `${date} already has a session; pick a later date`);
    }
  }
  return errors.length ? { pins: { ...pins }, errors } : { pins: out, errors };
}

/** The next routines sync strictly after `nowMs`, as local HH:MM. */
export function nextSync(nowMs: number, tz: string): string {
  const d = new Date(nowMs);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, SYNC_MIN);
  while (t <= nowMs) t += SYNC_EVERY_H * HOUR;
  return hhmm(new Date(t), tz);
}
