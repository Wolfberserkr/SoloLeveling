// ═════════════════════════════════════════════════════════════════════════
// Google Calendar, instantly, through the owner's Apps Script bridge
// (life/google-tasks-bridge.gs, the same deployment as Google Tasks).
// When the bridge isn't linked or fails, bookings fall back to a pending
// life_jobs row that the 3-hourly sync carries out.
// ═════════════════════════════════════════════════════════════════════════
import { bookEvent, removeEvents, type BookSpec, type Bridge, type NewEvent } from '../_shared/booking.ts';
import type { CalEvent } from '../_shared/scheduling.ts';
import { gcall, gtasksEnabled } from './gtasks.ts';

// deno-lint-ignore no-explicit-any
type Db = any;
type Row = Record<string, unknown>;

const TIMEOUT_MS = 8000;

export const gcalEnabled = (): boolean => gtasksEnabled();

export const bridge: Bridge = {
  list: (from, to) => gcall<CalEvent[]>('calEvents', { from, to }, TIMEOUT_MS),
  create: (event: NewEvent) => gcall<{ id: string }>('calCreate', { event }, TIMEOUT_MS),
  update: (id, patch) => gcall<{ id: string }>('calUpdate', { id, patch }, TIMEOUT_MS),
  remove: async (id) => { await gcall('calDelete', { id }, TIMEOUT_MS); },
};

/** Write live events into the mirror the rest of Jarvis reads. Pruning stays with the sync. */
export async function refreshCache(db: Db, userId: string, evs: CalEvent[]): Promise<void> {
  if (!evs.length) return;
  const now = new Date().toISOString();
  const { error } = await db.from('life_calendar_cache').upsert(
    evs.map((e) => ({ user_id: userId, event_id: e.id, starts_at: e.start, ends_at: e.end, title: e.title, all_day: e.allDay, synced_at: now })),
    { onConflict: 'user_id,event_id' },
  );
  if (error) console.error('life-bot: calendar cache upsert failed', error);
}

/** The owner's events in [from, to): live from Google when linked, else the mirror (up to 3 h old). */
export async function liveEvents(db: Db, userId: string, from: Date, to: Date): Promise<{ events: CalEvent[]; live: boolean }> {
  if (gcalEnabled()) {
    try {
      const events = await bridge.list(from.toISOString(), to.toISOString());
      await refreshCache(db, userId, events);
      return { events, live: true };
    } catch (err) {
      console.error('life-bot: live calendar read failed, using the mirror', err);
    }
  }
  const { data } = await db.from('life_calendar_cache').select('event_id,starts_at,ends_at,title,all_day').eq('user_id', userId)
    .lt('starts_at', to.toISOString()).gt('ends_at', from.toISOString()).order('starts_at');
  return {
    events: ((data ?? []) as Row[]).map((r) => ({ id: String(r.event_id), title: String(r.title ?? ''), start: String(r.starts_at), end: String(r.ends_at ?? r.starts_at), allDay: !!r.all_day, description: '' })),
    live: false,
  };
}

async function jobPayload(db: Db, jobId: string): Promise<Row> {
  const { data } = await db.from('life_jobs').select('payload').eq('id', jobId).maybeSingle();
  return ((data?.payload ?? {}) as Row);
}

/**
 * Book a life_jobs row (status 'running') now. Success: job done, event ids in
 * payload.event_ids. Bridge off or failing: job back to 'pending' for the sync.
 */
export async function bookJob(db: Db, userId: string, jobId: string, spec: BookSpec): Promise<{ booked: boolean; ids: string[]; reason?: string }> {
  const r = gcalEnabled() ? await bookEvent(bridge, spec) : ({ ok: false, error: 'Google Calendar bridge not linked' } as const);
  const payload = { ...(await jobPayload(db, jobId)), via: 'life-bot' };
  if (!r.ok) {
    // clean === false: a part may be left on the calendar; Undo/↔ then also queue a jid sweep.
    const leftover = 'clean' in r && r.clean === false;
    await db.from('life_jobs').update({ status: 'pending', payload: { ...payload, sweep_failed: leftover } }).eq('user_id', userId).eq('id', jobId);
    return { booked: false, ids: [], reason: r.error };
  }
  const { error } = await db.from('life_jobs').update({ status: 'done', result: 'created by life-bot', payload: { ...payload, event_ids: r.ids }, done_at: new Date().toISOString() })
    .eq('user_id', userId).eq('id', jobId);
  // The event exists either way; a job stuck in 'running' is picked up by the sync's jid check.
  if (error) console.error('life-bot: job update after booking failed', error);
  await refreshCache(db, userId, r.created);
  return { booked: true, ids: r.ids };
}

/**
 * Undo a booking. 'removed': gone now (or cancelled before it was created).
 * 'queued': the sync removes it. 'gone': nothing left to undo.
 */
export async function undoJob(db: Db, userId: string, jobId: string): Promise<'removed' | 'queued' | 'gone'> {
  const { data: job } = await db.from('life_jobs').select('id,status,payload').eq('user_id', userId).eq('id', jobId).maybeSingle();
  if (!job || job.status === 'cancelled') return 'gone';
  const p = (job.payload ?? {}) as Row;
  const ids = Array.isArray(p.event_ids) ? (p.event_ids as string[]) : [];
  const cancel = (result: string) => db.from('life_jobs').update({ status: 'cancelled', result, done_at: new Date().toISOString() }).eq('id', job.id);
  if (!ids.length) {
    if (job.status === 'offered') { await cancel('no slot picked'); return 'removed'; }
    if (job.status !== 'pending') return 'gone';
    await cancel('undone before it was created');
    if (!p.sweep_failed) return 'removed';
    // A failed booking may have left a piece behind: have the sync remove everything with this jid.
    await db.from('life_jobs').insert({ user_id: userId, kind: 'calendar', instruction: `Remove any leftover Jarvis events for "${p.title ?? '?'}" (jid ${job.id}): the owner undid it.`, payload: { type: 'delete_event', title: p.title ?? null, start: p.start ?? null, jid: job.id } });
    return 'queued';
  }
  if (gcalEnabled()) {
    const r = await removeEvents(bridge, ids);
    const gone = ids.filter((id) => !r.failed.includes(id));
    if (gone.length) await db.from('life_calendar_cache').delete().eq('user_id', userId).in('event_id', gone);
    if (r.ok) { await cancel('undone'); return 'removed'; }
  }
  await db.from('life_jobs').insert({
    user_id: userId, kind: 'calendar',
    instruction: `Delete the Jarvis-created event "${p.title ?? '?'}" on ${p.local ?? '?'} (and its travel blocks): the owner undid it.`,
    payload: { type: 'delete_event', title: p.title ?? null, start: p.start ?? null, jid: job.id },
  });
  await cancel('undo queued for the sync');
  return 'queued';
}
