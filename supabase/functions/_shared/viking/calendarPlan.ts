// Google Calendar training blocks: placement and reconcile. Pure; time is passed in.
import { SESS } from './data.ts';
import { RIDES } from './bikePlan.ts';
import { dtoMinutes } from './garmin.ts';
import type { PlanDay } from './planner.ts';
import type { CalEvent } from '../scheduling.ts';
import { zonedTime, type Interval } from '../lifeLogic.ts';

export type Block = { date: string; key: string; title: string; start: string; end: string; overlaps: boolean };
export type BlockState = { eventId: string; key: string; start: string; end: string };
export type CalOps = { create: Block[]; update: Array<{ id: string; block: Block }>; remove: string[]; state: Record<string, BlockState> };

const MIN = 60000;
const RIDE_PAD = 10;

/** Key, title and block length for a day, or null when nothing is planned. */
export function blockFor(d: PlanDay): { key: string; title: string; minutes: number } | null {
  if (d.kind === 'gym' && d.session) {
    return { key: `gym:${d.session}:60`, title: `🏋️ Viking ${SESS[d.session].n}`, minutes: 60 };
  }
  if (d.kind === 'ride' && d.ride) {
    const work = d.garmin ? dtoMinutes(d.garmin.dto) : d.ride.minutes;
    const minutes = work + RIDE_PAD;
    return { key: `ride:${d.ride.code}:${minutes}`, title: `🚴 Viking ${d.ride.code} · ${RIDES[d.ride.code].n} ${work} min`, minutes };
  }
  return null;
}

/** First 15-min-aligned free start inside the window; else the window start, marked overlapping. */
export function trainingSlot(date: string, window: string, minutes: number, tz: string, busy: Interval[]): { start: Date; end: Date; overlaps: boolean } {
  const range = window.match(/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/);
  const one = window.match(/(\d{1,2}):(\d{2})/);
  const hm = (h: string, m: string) => `${h.padStart(2, '0')}:${m}`;
  let winStart: Date;
  let winEnd: Date;
  if (range) {
    winStart = zonedTime(date, hm(range[1], range[2]), tz);
    winEnd = zonedTime(date, hm(range[3], range[4]), tz);
  } else if (one) {
    winStart = zonedTime(date, hm(one[1], one[2]), tz);
    winEnd = new Date(winStart.getTime() + 240 * MIN);
  } else {
    winStart = zonedTime(date, '16:30', tz);
    winEnd = new Date(winStart.getTime() + 180 * MIN);
  }
  const len = minutes * MIN;
  const step = 15 * MIN;
  for (let t = Math.ceil(winStart.getTime() / step) * step; t + len <= winEnd.getTime(); t += step) {
    if (!busy.some((b) => b.start.getTime() < t + len && b.end.getTime() > t)) {
      return { start: new Date(t), end: new Date(t + len), overlaps: false };
    }
  }
  return { start: winStart, end: new Date(winStart.getTime() + len), overlaps: true };
}

export function desiredBlocks(days: PlanDay[], windows: Record<string, string>, tz: string, busy: Interval[]): Block[] {
  const out: Block[] = [];
  for (const d of days) {
    const b = blockFor(d);
    if (!b) continue;
    const s = trainingSlot(d.date, windows[d.date] ?? '', b.minutes, tz, busy);
    out.push({ date: d.date, key: b.key, title: b.title, start: s.start.toISOString(), end: s.end.toISOString(), overlaps: s.overlaps });
  }
  return out;
}

const same = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();
const isOurs = (e: CalEvent, date: string) => e.description.includes('[jarvis]') && e.description.includes(`viking:${date}`);
const stateOf = (id: string, b: Block): BlockState => ({ eventId: id, key: b.key, start: b.start, end: b.end });

export function reconcile(desired: Block[], state: Record<string, BlockState>, existing: CalEvent[], now: Date, range: { from: string; to: string }): CalOps {
  const ops: CalOps = { create: [], update: [], remove: [], state: { ...state } };
  const inRange = (d: string) => d >= range.from && d <= range.to;
  const want = new Map(desired.filter((b) => inRange(b.date)).map((b) => [b.date, b]));
  const dates = new Set<string>([...want.keys(), ...Object.keys(state).filter(inRange)]);
  for (const date of [...dates].sort()) {
    const w = want.get(date);
    const st = state[date];
    if (w) {
      if (st) {
        if (st.key === w.key) continue; // the owner's edits stand
        if (new Date(st.start).getTime() <= now.getTime()) continue; // already started: keep it
        const ev = existing.find((e) => e.id === st.eventId);
        if (ev) { ops.update.push({ id: ev.id, block: w }); ops.state[date] = stateOf(ev.id, w); }
        else { ops.create.push(w); ops.state[date] = stateOf('', w); }
      } else {
        const live = existing.find((e) => isOurs(e, date));
        if (live) {
          const differs = live.title !== w.title || !same(live.start, w.start) || !same(live.end, w.end);
          if (differs) { ops.update.push({ id: live.id, block: w }); ops.state[date] = stateOf(live.id, w); }
          else ops.state[date] = stateOf(live.id, { ...w, start: live.start, end: live.end });
        } else {
          ops.create.push(w);
          ops.state[date] = stateOf('', w);
        }
      }
    } else if (st) {
      if (new Date(st.start).getTime() > now.getTime()) {
        if (existing.some((e) => e.id === st.eventId)) ops.remove.push(st.eventId);
        delete ops.state[date];
      }
    }
  }
  return ops;
}
