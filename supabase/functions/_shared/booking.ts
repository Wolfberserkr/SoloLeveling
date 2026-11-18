// ═════════════════════════════════════════════════════════════════════════
// Booking against any calendar bridge: the event plus its travel blocks, all
// or nothing. life-bot binds `Bridge` to the owner's Apps Script; tests use a
// fake. No Deno or network APIs here.
// ═════════════════════════════════════════════════════════════════════════
import { eventTitle, jarvisDescription, jobIdOf, type CalEvent } from './scheduling.ts';

export type NewEvent = { title: string; start: string; end: string; allDay: boolean; location?: string | null; description: string; remindersMin: number[] };

export type Bridge = {
  list(from: string, to: string): Promise<CalEvent[]>;
  create(e: NewEvent): Promise<{ id: string }>;
  update(id: string, patch: Partial<NewEvent>): Promise<{ id: string }>;
  remove(id: string): Promise<void>;
};

export type BookSpec = {
  jobId: string; kind: string; title: string; start: Date; end: Date; allDay: boolean;
  location?: string | null; notes?: string | null; remindersMin: number[]; travelMinutes: number;
};

/** `clean` false: something this booking made may still be on the calendar (it carries the jid). */
export type BookResult = { ok: true; ids: string[]; created: CalEvent[] } | { ok: false; error: string; clean: boolean };

const TRAVEL = '🚗 Travel';
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Create the event (ids[0]) and, with a travel buffer, a 🚗 Travel block either side. Any failure removes what was made. */
export async function bookEvent(b: Bridge, s: BookSpec): Promise<BookResult> {
  const main: NewEvent = {
    title: eventTitle(s.kind, s.title), start: s.start.toISOString(), end: s.end.toISOString(), allDay: s.allDay,
    location: s.location ?? null, description: jarvisDescription(s.notes, s.kind, s.jobId), remindersMin: s.remindersMin,
  };
  const evs = [main];
  if (s.travelMinutes > 0 && !s.allDay) {
    const t = s.travelMinutes * 60000, description = jarvisDescription(null, 'travel', s.jobId);
    evs.push(
      { title: TRAVEL, start: new Date(s.start.getTime() - t).toISOString(), end: main.start, allDay: false, description, remindersMin: [] },
      { title: TRAVEL, start: main.end, end: new Date(s.end.getTime() + t).toISOString(), allDay: false, description, remindersMin: [] },
    );
  }
  const res = await Promise.allSettled(evs.map((e) => b.create(e)));
  const idOf = (r: PromiseSettledResult<{ id: string }>) => (r.status === 'fulfilled' && typeof r.value?.id === 'string' && r.value.id ? r.value.id : null);
  const made = res.map(idOf).filter((x): x is string => !!x);
  if (made.length < evs.length) {
    const bad = res.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    const error = bad ? msg(bad.reason) : 'the calendar returned no event id';
    await removeEvents(b, made);
    // A call that timed out on our side may still have created its event: sweep by jid.
    const clean = await sweepJob(b, s.jobId, new Date(s.start.getTime() - s.travelMinutes * 60000 - 3600000), new Date(s.end.getTime() + s.travelMinutes * 60000 + 3600000));
    return { ok: false, error, clean };
  }
  const ids = made;
  return { ok: true, ids, created: evs.map((e, i) => ({ id: ids[i], title: e.title, start: e.start, end: e.end, allDay: e.allDay, description: e.description })) };
}

/** Remove every event carrying `jid:<jobId>` in [from, to), trying twice. True when none is left. */
export async function sweepJob(b: Bridge, jobId: string, from: Date, to: Date): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let left: CalEvent[];
    try { left = (await b.list(from.toISOString(), to.toISOString())).filter((e) => jobIdOf(e.description) === jobId); } catch { return false; }
    if (!left.length) return true;
    await removeEvents(b, left.map((e) => e.id));
  }
  try { return !(await b.list(from.toISOString(), to.toISOString())).some((e) => jobIdOf(e.description) === jobId); } catch { return false; }
}

/** Remove every id; a failure doesn't stop the rest. */
export async function removeEvents(b: Bridge, ids: string[]): Promise<{ ok: boolean; failed: string[] }> {
  const res = await Promise.allSettled(ids.map((id) => b.remove(id)));
  const failed = ids.filter((_, i) => res[i].status === 'rejected');
  return { ok: failed.length === 0, failed };
}

/** Move an event and keep its travel blocks hugging it, each at its own length. */
export async function moveEvent(b: Bridge, g: { main: CalEvent; travel: CalEvent[] }, start: Date, end: Date): Promise<{ ok: boolean; error?: string }> {
  const len = (e: CalEvent) => Date.parse(e.end) - Date.parse(e.start);
  const jobs = [b.update(g.main.id, { start: start.toISOString(), end: end.toISOString() })];
  for (const t of g.travel) {
    const before = Date.parse(t.start) < Date.parse(g.main.start);
    jobs.push(b.update(t.id, before
      ? { start: new Date(start.getTime() - len(t)).toISOString(), end: start.toISOString() }
      : { start: end.toISOString(), end: new Date(end.getTime() + len(t)).toISOString() }));
  }
  const bad = (await Promise.allSettled(jobs)).find((r): r is PromiseRejectedResult => r.status === 'rejected');
  return bad ? { ok: false, error: msg(bad.reason) } : { ok: true };
}
