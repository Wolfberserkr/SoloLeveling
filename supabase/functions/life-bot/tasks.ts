// ═════════════════════════════════════════════════════════════════════════
// Tasks: life_tasks is Jarvis's copy; Google Tasks is where the owner sees
// them. Writes push to Google straight away (a failed push is retried by the
// tick); every 5 minutes the tick pulls changes made in the Google Tasks app.
// ═════════════════════════════════════════════════════════════════════════
import { addDays, listFor, localParts, nextOccurrence, recurLabel, TASK_LISTS, zonedTime } from '../_shared/lifeLogic.ts';
import { gcall, gtasksEnabled, type GTask } from './gtasks.ts';
import type { Db } from './agent.ts';

type Row = Record<string, unknown>;
const JARVIS_NOTE = '\n\n— Jarvis: ';

async function readPrefsRaw(db: Db, userId: string): Promise<Row> {
  const { data } = await db.from('life_profile').select('prefs').eq('user_id', userId).maybeSingle();
  return ((data?.prefs ?? {}) as Row);
}
async function mergePrefs(db: Db, userId: string, patch: Row) {
  const prefs = await readPrefsRaw(db, userId);
  await db.from('life_profile').update({ prefs: { ...prefs, ...patch }, updated_at: new Date().toISOString() }).eq('user_id', userId);
}

/** List name → Google Tasks list id, creating the five lists the first time. */
export async function listIds(db: Db, userId: string): Promise<Record<string, string>> {
  const prefs = await readPrefsRaw(db, userId);
  const have = (prefs.gtaskLists ?? {}) as Record<string, string>;
  if (TASK_LISTS.every((l) => have[l])) return have;
  const map = await gcall<Record<string, string>>('ensureLists', { titles: [...TASK_LISTS] });
  await mergePrefs(db, userId, { gtaskLists: map });
  return map;
}

function googleNotes(t: Row, tz: string): string {
  const meta: string[] = [];
  const rl = recurLabel(t.recur as string | null);
  if (rl) meta.push(`🔁 ${rl}`);
  if (t.remind_at) meta.push(`⏰ reminder ${new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(String(t.remind_at)))} on Telegram`);
  return String(t.notes ?? '') + (meta.length ? JARVIS_NOTE + meta.join(' · ') : '');
}
const ownNotes = (g: string) => g.split(JARVIS_NOTE)[0].trim() || null;
const gDue = (d: unknown) => (d ? `${String(d).slice(0, 10)}T00:00:00.000Z` : null);

/** Create or update the Google copy of one task. Never throws: a failed push is retried later. */
export async function pushTask(db: Db, userId: string, tz: string, id: string): Promise<boolean> {
  if (!gtasksEnabled()) return false;
  try {
    const { data: t } = await db.from('life_tasks').select('*').eq('user_id', userId).eq('id', id).maybeSingle();
    if (!t) return false;
    const lists = await listIds(db, userId);
    const listId = lists[listFor(t.list)];
    const body = { title: t.title, notes: googleNotes(t, tz), due: gDue(t.due_on), status: t.done_at ? 'completed' : 'needsAction' };
    let g: GTask;
    if (t.gtask_id && t.gtask_list && t.gtask_list !== listId) {
      await gcall('delete', { list: t.gtask_list, id: t.gtask_id });
      g = await gcall<GTask>('insert', { list: listId, task: body });
    } else if (t.gtask_id) {
      g = await gcall<GTask>('patch', { list: t.gtask_list ?? listId, id: t.gtask_id, task: body });
    } else {
      g = await gcall<GTask>('insert', { list: listId, task: body });
    }
    await db.from('life_tasks').update({ gtask_id: g.id, gtask_list: listId, gtask_updated: g.updated }).eq('id', id);
    return true;
  } catch (err) {
    console.error('life-bot: Google Tasks push failed', err);
    return false;
  }
}

export async function addTasks(db: Db, userId: string, tz: string, items: Row[]): Promise<Row[]> {
  const { data, error } = await db.from('life_tasks').insert(items.map((i) => ({ user_id: userId, ...i }))).select('id,title,list,due_on,recur,remind_at');
  if (error) throw new Error(error.message);
  await Promise.all((data as Row[]).map((r) => pushTask(db, userId, tz, String(r.id))));
  return data as Row[];
}

/** Tick a task off; a recurring one comes back with its next due date. */
export async function completeTask(db: Db, userId: string, tz: string, id: string, fromGoogle = false): Promise<{ title: string; next?: string } | null> {
  const { data: t } = await db.from('life_tasks').select('*').eq('user_id', userId).eq('id', id).maybeSingle();
  if (!t || t.done_at) return t ? { title: String(t.title) } : null;
  await db.from('life_tasks').update({ done_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id);
  if (!fromGoogle) await pushTask(db, userId, tz, id);
  return { title: String(t.title), next: (await spawnNext(db, userId, tz, t)) ?? undefined };
}

/** A finished recurring task comes back once, with its next due date. */
export async function spawnNext(db: Db, userId: string, tz: string, t: Row): Promise<string | null> {
  if (!t.recur || t.next_spawned) return null;
  const { data: claimed } = await db.from('life_tasks').update({ next_spawned: true }).eq('id', t.id).eq('next_spawned', false).select('id');
  if (!(claimed ?? []).length) return null; // another run got there first
  const today = localParts(new Date(), tz).date;
  const base = t.due_on && String(t.due_on) >= today ? String(t.due_on) : today;
  const next = nextOccurrence(base, String(t.recur));
  if (!next) return null;
  // Keep the reminder at the same local time of day.
  const remind = t.remind_at ? zonedTime(next, new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(String(t.remind_at))), tz).toISOString() : null;
  await addTasks(db, userId, tz, [{ title: t.title, list: t.list, area: t.area, notes: t.notes, recur: t.recur, due_on: next, remind_at: remind }]);
  return next;
}

/** Recurring tasks ticked off outside the bot (the dashboard) still come back. */
export async function spawnPending(db: Db, userId: string, tz: string): Promise<number> {
  const { data } = await db.from('life_tasks').select('*').eq('user_id', userId).not('recur', 'is', null).not('done_at', 'is', null)
    .eq('next_spawned', false).gte('done_at', new Date(Date.now() - 14 * 86400000).toISOString()).limit(5);
  let n = 0;
  for (const t of (data ?? []) as Row[]) if (await spawnNext(db, userId, tz, t)) n++;
  return n;
}

export async function deleteTask(db: Db, userId: string, id: string) {
  const { data: t } = await db.from('life_tasks').select('gtask_id,gtask_list').eq('user_id', userId).eq('id', id).maybeSingle();
  await db.from('life_tasks').delete().eq('user_id', userId).eq('id', id);
  if (t?.gtask_id && gtasksEnabled()) await gcall('delete', { list: t.gtask_list, id: t.gtask_id }).catch((e) => console.error('life-bot: Google delete failed', e));
}

/** Pull edits made in the Google Tasks app and retry pushes that failed. */
export async function syncGoogle(db: Db, userId: string, tz: string): Promise<{ pulled: number; pushed: number }> {
  if (!gtasksEnabled()) return { pulled: 0, pushed: 0 };
  const prefs = await readPrefsRaw(db, userId);
  const lists = await listIds(db, userId);
  const since = typeof prefs.gtaskPulledAt === 'string' ? prefs.gtaskPulledAt : new Date(Date.now() - 30 * 86400000).toISOString();
  const started = new Date(Date.now() - 60000).toISOString();
  const changes = await gcall<GTask[]>('changes', { lists, since });
  let pulled = 0;
  for (const g of changes) {
    const { data: t } = await db.from('life_tasks').select('*').eq('user_id', userId).eq('gtask_id', g.id).maybeSingle();
    if (t && t.gtask_updated && Date.parse(String(t.gtask_updated)) >= Date.parse(g.updated)) continue; // our own write
    if (!t) {
      if (g.deleted || g.status === 'completed' || !g.title?.trim()) continue;
      await db.from('life_tasks').insert({ user_id: userId, title: g.title.trim(), list: listFor(g.list), notes: ownNotes(g.notes ?? ''), due_on: g.due ? g.due.slice(0, 10) : null, gtask_id: g.id, gtask_list: lists[listFor(g.list)], gtask_updated: g.updated, source: 'google' });
      pulled++;
      continue;
    }
    if (g.deleted) { await db.from('life_tasks').delete().eq('id', t.id); pulled++; continue; }
    await db.from('life_tasks').update({
      title: g.title?.trim() || t.title, notes: ownNotes(g.notes ?? ''), due_on: g.due ? g.due.slice(0, 10) : null,
      list: g.list ? listFor(g.list) : t.list, gtask_updated: g.updated,
      ...(g.status === 'needsAction' && t.done_at ? { done_at: null } : {}),
    }).eq('id', t.id);
    if (g.status === 'completed' && !t.done_at) await completeTask(db, userId, tz, String(t.id), true);
    pulled++;
  }
  // Push edits made outside the bot (the dashboard), then retry tasks that never reached Google.
  const { data: dirty } = await db.from('life_tasks').select('id,updated_at,gtask_updated').eq('user_id', userId).not('gtask_id', 'is', null)
    .gte('updated_at', new Date(Date.now() - 15 * 60000).toISOString()).limit(20);
  for (const d of (dirty ?? []) as Row[]) {
    if (!d.gtask_updated || Date.parse(String(d.updated_at)) > Date.parse(String(d.gtask_updated)) + 1000) await pushTask(db, userId, tz, String(d.id));
  }
  const { data: missing } = await db.from('life_tasks').select('id').eq('user_id', userId).is('done_at', null).is('gtask_id', null).limit(10);
  let pushed = 0;
  for (const m of (missing ?? []) as Row[]) if (await pushTask(db, userId, tz, String(m.id))) pushed++;
  await mergePrefs(db, userId, { gtaskPulledAt: started });
  return { pulled, pushed };
}

export const tomorrowSameTime = (iso: string) => new Date(Date.parse(iso) + 86400000).toISOString();
export { addDays };
