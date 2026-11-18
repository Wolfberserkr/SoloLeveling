// ═════════════════════════════════════════════════════════════════════════
// Instant scheduling: pure helpers shared by life-bot and the tests.
// Titles, the [jarvis] ownership marker, live busy time, slot picking and the
// Telegram confirmation line. No Deno or network APIs here.
// ═════════════════════════════════════════════════════════════════════════
import { escapeHtml, hhmm, localParts, zonedTime, type EventKind, type Interval } from './lifeLogic.ts';

export const KIND_EMOJI: Record<EventKind, string> = { medical: '🩺', personal: '📌', social: '👥', training: '🏋️', other: '📅' };

/** The calendar title: the kind's emoji in front, never twice. */
export function eventTitle(kind: unknown, title: string): string {
  const e = KIND_EMOJI[kind as EventKind] ?? KIND_EMOJI.other;
  const t = title.trim();
  return t.startsWith(e) ? t : `${e} ${t}`;
}

/** Description for an event Jarvis owns: notes, then `[jarvis] <tag> · jid:<job id>`. */
export function jarvisDescription(notes: string | null | undefined, tag: string, jobId: string): string {
  const marker = `[jarvis] ${tag} · jid:${jobId}`;
  return notes && notes.trim() ? `${notes.trim()}\n${marker}` : marker;
}

export const isJarvis = (desc: string | null | undefined): boolean => /\[jarvis\]/.test(desc ?? '');

export function jobIdOf(desc: string | null | undefined): string | null {
  return /jid:([0-9a-f-]{36})/.exec(desc ?? '')?.[1] ?? null;
}

export type CalEvent = { id: string; title: string; start: string; end: string; allDay: boolean; description: string };

/** Timed events as busy intervals. All-day events (holidays, birthdays) don't block time. */
export function busyFromEvents(evs: CalEvent[]): Interval[] {
  return evs.filter((e) => !e.allDay).map((e) => ({ start: new Date(e.start), end: new Date(e.end), label: e.title }));
}

export type SlotOpts = { minutes: number; travelMinutes: number; outdoor: boolean; tz: string; now: Date; offDays: Set<string>; max?: number };

const HALF_HOUR = 30 * 60000;
const ceilHalfHour = (t: number) => Math.ceil(t / HALF_HOUR) * HALF_HOUR; // owner timezones are whole/half-hour offsets

/**
 * Up to `max` (3) bookable starts inside free windows. Starts land on :00/:30
 * with the travel buffer before and after; outdoor errands skip 11:00–16:00.
 * Off days first, one per day before doubling up, returned in time order.
 */
export function pickSlots(windows: Interval[], o: SlotOpts): Interval[] {
  const len = o.minutes * 60000, pad = o.travelMinutes * 60000;
  const cands: Array<Interval & { date: string }> = [];
  for (const w of [...windows].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    let s = ceilHalfHour(Math.max(w.start.getTime() + pad, o.now.getTime()));
    if (o.outdoor) {
      const date = localParts(new Date(s), o.tz).date;
      const hot0 = zonedTime(date, '11:00', o.tz).getTime(), hot1 = zonedTime(date, '16:00', o.tz).getTime();
      if (s < hot1 && s + len > hot0) s = ceilHalfHour(hot1);
    }
    if (s + len + pad <= w.end.getTime()) cands.push({ start: new Date(s), end: new Date(s + len), date: localParts(new Date(s), o.tz).date });
  }
  const ordered = [...cands].sort((a, b) => Number(o.offDays.has(b.date)) - Number(o.offDays.has(a.date)) || a.start.getTime() - b.start.getTime());
  const max = o.max ?? 3, picked: typeof cands = [], days = new Set<string>();
  for (const c of ordered) if (picked.length < max && !days.has(c.date)) { picked.push(c); days.add(c.date); }
  for (const c of ordered) if (picked.length < max && !picked.includes(c)) picked.push(c);
  return picked.sort((a, b) => a.start.getTime() - b.start.getTime()).map(({ start, end }) => ({ start, end }));
}

export const OFFER_TTL_MS = 172_800_000;
export const offerExpired = (createdAt: string | Date, now: Date): boolean => now.getTime() - new Date(createdAt).getTime() > OFFER_TTL_MS;

const dayLabel = (d: Date, tz: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(d).replace(',', '');

/** Button label, e.g. "Thu 20 Nov 14:00". */
export const slotLabel = (s: Interval, tz: string): string => `${dayLabel(s.start, tz)} ${hhmm(s.start, tz)}`;

const remLabel = (m: number) => (m >= 1440 && m % 1440 === 0 ? `${m / 1440} day` : m >= 60 && m % 60 === 0 ? `${m / 60} h` : `${m} min`);

/** The Telegram confirmation after a booking. */
export function bookedText(
  e: { title: string; start: Date; end: Date; allDay: boolean; location?: string | null; travelMinutes: number; remindersMin: number[]; clashes: string[] },
  tz: string,
): string {
  const when = e.allDay ? `${dayLabel(e.start, tz)} (all day)` : `${dayLabel(e.start, tz)} ${hhmm(e.start, tz)}–${hhmm(e.end, tz)}`;
  const lines = [`📅 <b>${escapeHtml(e.title)}</b> · ${when}${e.location ? ` · ${escapeHtml(e.location)}` : ''}`];
  const extra = [
    e.travelMinutes > 0 ? `🚗 ${e.travelMinutes} min travel either side` : '',
    e.remindersMin.length ? `🔔 ${e.remindersMin.map(remLabel).join(' + ')} before` : '',
  ].filter(Boolean);
  if (extra.length) lines.push(extra.join(' · '));
  for (const c of e.clashes) lines.push(`⚠️ ${escapeHtml(c)}`);
  return lines.join('\n');
}

const plain = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Jarvis-owned events whose title holds every word, optionally on one local date. */
export function matchJarvisEvents(evs: CalEvent[], words: string, date: string | undefined, tz: string): CalEvent[] {
  const want = plain(words).split(' ').filter(Boolean);
  return evs.filter((e) => isJarvis(e.description)
    && e.title !== '🚗 Travel'
    && want.every((w) => plain(e.title).split(' ').includes(w))
    && (!date || localParts(new Date(e.start), tz).date === date));
}
