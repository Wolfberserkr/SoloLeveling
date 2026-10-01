// Ascend data layer. Reads go straight to the ascend_* tables (RLS scopes
// every row to auth.uid()); anything that earns or removes XP goes through
// the SECURITY DEFINER functions in 0027_ascend.sql, so the client can never
// write the XP ledger directly.
import { supabase } from '@/lib/supabase';
import { todayInTz } from '@/lib/dates';
import {
  defaultSettings,
  type ABoss, type ACompletion, type AMilestone, type AQuest, type AReview, type ASettings,
  type AStat, type ASub, type ATicket, type AscendData, type QuestType, type StatColor,
} from './logic';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));
const n = (v: unknown) => Number(v ?? 0);

/** Friendly message from a PostgREST / Postgres error. The SQL raises
 *  plain-English messages, so those pass through untouched. */
export function errText(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = String((e as { message: unknown }).message);
    if (/Failed to fetch|NetworkError|network/i.test(m)) return "Can't reach the server. Check your connection and try again.";
    return m;
  }
  return 'Something went wrong. Try again.';
}
function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

// ── Row mappers ──────────────────────────────────────────────────────────────
export const mapStat = (r: Row): AStat => ({ id: String(r.id), name: String(r.name), icon: String(r.icon), color: r.color as StatColor, position: n(r.position) });
export const mapSub = (r: Row): ASub => ({ id: String(r.id), statId: String(r.stat_id), name: String(r.name), note: String(r.note ?? ''), position: n(r.position) });
export const mapQuest = (r: Row, tz: string | null): AQuest => ({
  id: String(r.id), type: r.type as QuestType, title: String(r.title), statId: String(r.stat_id), subId: s(r.sub_id),
  xp: n(r.xp), days: ((r.days as number[] | null) ?? []).map(Number), timed: Boolean(r.timed), due: s(r.due),
  target: s(r.target), doneAt: s(r.done_at), archived: Boolean(r.archived),
  createdOn: todayInTz(tz, new Date(String(r.created_at))),
});
export const mapMilestone = (r: Row): AMilestone => ({ id: String(r.id), questId: String(r.quest_id), title: String(r.title), xp: n(r.xp), position: n(r.position), doneAt: s(r.done_at) });
export const mapBoss = (r: Row): ABoss => ({
  id: String(r.id), title: String(r.title), statId: String(r.stat_id), subId: s(r.sub_id), xp: n(r.xp),
  avoidingSince: s(r.avoiding_since), why: String(r.why ?? ''), defeatedAt: s(r.defeated_at),
});
export const mapTicket = (r: Row): ATicket => ({ id: String(r.id), xp: n(r.xp), title: String(r.title), claimedAt: s(r.claimed_at) });
export const mapReview = (r: Row): AReview => ({
  id: String(r.id), localDate: String(r.local_date), weekStart: String(r.week_start), wins: String(r.wins ?? ''),
  slipped: String(r.slipped ?? ''), focusStat: s(r.focus_stat), stoic: String(r.stoic ?? ''),
});
export const mapCompletion = (r: Row): ACompletion => ({
  id: String(r.id), kind: r.kind as ACompletion['kind'], questId: s(r.quest_id), milestoneId: s(r.milestone_id),
  bossId: s(r.boss_id), reviewId: s(r.review_id), title: String(r.title), parentTitle: s(r.parent_title),
  statId: String(r.stat_id), subId: s(r.sub_id), xp: n(r.xp), minutes: r.minutes == null ? null : n(r.minutes),
  localDate: String(r.local_date), createdAt: new Date(String(r.created_at)).getTime(),
});
function mapSettings(raw: unknown): ASettings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Partial<ASettings>;
  return {
    theme: o.theme === 'light' || o.theme === 'dark' ? o.theme : 'system',
    focusWork: Number(o.focusWork) > 0 ? Number(o.focusWork) : d.focusWork,
    focusBreak: Number(o.focusBreak) > 0 ? Number(o.focusBreak) : d.focusBreak,
    templates: Array.isArray(o.templates) && o.templates.length ? o.templates.map((t) => ({ label: String(t.label), xp: Number(t.xp) || 1 })) : d.templates,
    reminders: o.reminders && typeof o.reminders === 'object'
      ? {
          enabled: o.reminders.enabled !== false,
          hours: Array.isArray(o.reminders.hours) ? o.reminders.hours.map(Number).filter((h) => Number.isInteger(h) && h >= 0 && h <= 23) : d.reminders.hours,
        }
      : d.reminders,
  };
}

// ── Load ─────────────────────────────────────────────────────────────────────
/** PostgREST caps a response at 1,000 rows; the ledger grows past that. */
async function allCompletions(): Promise<Row[]> {
  const out: Row[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const rows = check(await supabase.from('ascend_completions').select('*').order('created_at', { ascending: true }).range(from, from + page - 1)) as Row[];
    out.push(...rows);
    if (rows.length < page) return out;
  }
}

export async function loadTimezone(uid: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('timezone').eq('user_id', uid).maybeSingle();
  return (data as { timezone?: string } | null)?.timezone ?? null;
}

export async function enroll(): Promise<boolean> {
  return Boolean(check(await supabase.rpc('ascend_enroll')));
}

export async function loadAll(tz: string | null): Promise<AscendData> {
  const [profile, stats, subs, quests, milestones, bosses, tickets, reviews, completions] = await Promise.all([
    supabase.from('ascend_profiles').select('settings').maybeSingle(),
    supabase.from('ascend_stats').select('*').order('position'),
    supabase.from('ascend_subskills').select('*').order('position'),
    supabase.from('ascend_quests').select('*').order('created_at'),
    supabase.from('ascend_milestones').select('*').order('position'),
    supabase.from('ascend_bosses').select('*').order('created_at'),
    supabase.from('ascend_tickets').select('*').order('xp'),
    supabase.from('ascend_reviews').select('*').order('local_date', { ascending: false }),
    allCompletions(),
  ]);
  return {
    settings: mapSettings((check(profile) as Row | null)?.settings),
    stats: (check(stats) as Row[]).map(mapStat),
    subskills: (check(subs) as Row[]).map(mapSub),
    quests: (check(quests) as Row[]).map((r) => mapQuest(r, tz)),
    milestones: (check(milestones) as Row[]).map(mapMilestone),
    bosses: (check(bosses) as Row[]).map(mapBoss),
    tickets: (check(tickets) as Row[]).map(mapTicket),
    reviews: (check(reviews) as Row[]).map(mapReview),
    completions: completions.map(mapCompletion),
  };
}

// ── Actions that touch XP (server functions) ─────────────────────────────────
export async function completeQuest(questId: string, minutes?: number): Promise<ACompletion> {
  return mapCompletion(check(await supabase.rpc('ascend_complete_quest', { p_quest: questId, p_minutes: minutes ?? null })) as Row);
}
export async function toggleMilestone(id: string): Promise<ACompletion | null> {
  const r = check(await supabase.rpc('ascend_toggle_milestone', { p_milestone: id })) as Row | null;
  return r && r.id ? mapCompletion(r) : null;
}
export async function defeatBoss(id: string): Promise<ACompletion> {
  return mapCompletion(check(await supabase.rpc('ascend_defeat_boss', { p_boss: id })) as Row);
}
export async function submitReview(r: { wins: string; slipped: string; focusStat: string; stoic: string }): Promise<ACompletion> {
  return mapCompletion(check(await supabase.rpc('ascend_submit_review', { p_wins: r.wins, p_slipped: r.slipped, p_focus_stat: r.focusStat, p_stoic: r.stoic })) as Row);
}
export async function claimTicket(id: string, claim: boolean): Promise<ATicket> {
  return mapTicket(check(await supabase.rpc('ascend_claim_ticket', { p_ticket: id, p_claim: claim })) as Row);
}
export async function removeCompletion(id: string): Promise<void> {
  check(await supabase.rpc('ascend_remove_completion', { p_completion: id }));
}

// ── Plain edits (RLS + column grants) ────────────────────────────────────────
export interface QuestInput {
  type: QuestType; title: string; statId: string; subId: string | null; xp: number;
  days: number[]; timed: boolean; due: string | null; target: string | null;
}
const questRow = (q: Partial<QuestInput>) => {
  const r: Row = {};
  if (q.type !== undefined) r.type = q.type;
  if (q.title !== undefined) r.title = q.title;
  if (q.statId !== undefined) r.stat_id = q.statId;
  if (q.subId !== undefined) r.sub_id = q.subId;
  if (q.xp !== undefined) r.xp = q.xp;
  if (q.days !== undefined) r.days = q.days;
  if (q.timed !== undefined) r.timed = q.timed;
  if (q.due !== undefined) r.due = q.due;
  if (q.target !== undefined) r.target = q.target;
  return r;
};
export async function insertQuest(q: QuestInput, tz: string | null): Promise<AQuest> {
  return mapQuest(check(await supabase.from('ascend_quests').insert(questRow(q)).select().single()) as Row, tz);
}
export async function updateQuest(id: string, q: Partial<Omit<QuestInput, 'type'>>, tz: string | null): Promise<AQuest> {
  return mapQuest(check(await supabase.from('ascend_quests').update(questRow(q)).eq('id', id).select().single()) as Row, tz);
}
export async function deleteQuest(id: string): Promise<void> {
  check(await supabase.from('ascend_quests').delete().eq('id', id));
}
export async function insertMilestones(questId: string, items: Array<{ title: string; xp: number; position: number }>): Promise<AMilestone[]> {
  if (!items.length) return [];
  const rows = items.map((m) => ({ quest_id: questId, title: m.title, xp: m.xp, position: m.position }));
  return (check(await supabase.from('ascend_milestones').insert(rows).select()) as Row[]).map(mapMilestone);
}
export async function deleteMilestone(id: string): Promise<void> {
  check(await supabase.from('ascend_milestones').delete().eq('id', id));
}
export interface BossInput { title: string; statId: string; subId: string | null; xp: number; avoidingSince: string | null; why: string }
const bossRow = (b: BossInput): Row => ({ title: b.title, stat_id: b.statId, sub_id: b.subId, xp: b.xp, avoiding_since: b.avoidingSince, why: b.why });
export async function insertBoss(b: BossInput): Promise<ABoss> {
  return mapBoss(check(await supabase.from('ascend_bosses').insert(bossRow(b)).select().single()) as Row);
}
export async function updateBoss(id: string, b: BossInput): Promise<ABoss> {
  return mapBoss(check(await supabase.from('ascend_bosses').update(bossRow(b)).eq('id', id).select().single()) as Row);
}
export async function deleteBoss(id: string): Promise<void> {
  check(await supabase.from('ascend_bosses').delete().eq('id', id));
}
export async function insertTicket(xp: number, title: string): Promise<ATicket> {
  return mapTicket(check(await supabase.from('ascend_tickets').insert({ xp, title }).select().single()) as Row);
}
export async function updateTicket(id: string, xp: number, title: string): Promise<ATicket> {
  return mapTicket(check(await supabase.from('ascend_tickets').update({ xp, title }).eq('id', id).select().single()) as Row);
}
export async function deleteTicket(id: string): Promise<void> {
  check(await supabase.from('ascend_tickets').delete().eq('id', id));
}
export async function updateStat(id: string, patch: Partial<Pick<AStat, 'name' | 'color' | 'icon'>>): Promise<void> {
  check(await supabase.from('ascend_stats').update(patch).eq('id', id));
}
export async function insertSub(statId: string, id: string, name: string, position: number): Promise<ASub> {
  return mapSub(check(await supabase.from('ascend_subskills').insert({ id, stat_id: statId, name, position }).select().single()) as Row);
}
export async function updateSub(id: string, name: string): Promise<void> {
  check(await supabase.from('ascend_subskills').update({ name }).eq('id', id));
}
export async function deleteSub(id: string): Promise<void> {
  check(await supabase.from('ascend_subskills').delete().eq('id', id));
}
export async function saveSettings(uid: string, settings: ASettings): Promise<void> {
  check(await supabase.from('ascend_profiles').update({ settings }).eq('user_id', uid));
}
