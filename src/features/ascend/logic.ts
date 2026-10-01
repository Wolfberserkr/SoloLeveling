// Ascend — pure game logic. No DOM, no Supabase: everything here takes the
// player's data in and returns values, so it is unit-tested (tests/ascend.test.ts)
// and mirrors the SQL in supabase/migrations/0027_ascend.sql exactly.
//
// Guiding principle: make what you value easier, stronger and more
// interesting over time. No penalties; long-term progression over streaks.

// ── Config ───────────────────────────────────────────────────────────────────
export const ASCEND = {
  maxLevel: 100,
  xpCurveK: 25, // total XP to reach level n = K × (n − 1) × (n + 2)
  daily: { min: 3, max: 5 },
  focus: { xpPerMinute: 1, capPerSession: 120, work: 25, brk: 5 },
  bossDefaultXp: 300,
  reviewXp: 50,
  undoMs: 5000,
  streakDayMinimum: 3, // a day counts when this many dailies are done (or all, if fewer)
  defaultMilestoneXp: 100,
  titles: [
    [100, 'Ascended'],
    [75, 'Master'],
    [50, 'Veteran'],
    [25, 'Adept'],
    [10, 'Apprentice'],
    [1, 'Initiate'],
  ] as Array<[number, string]>,
  colors: ['blue', 'green', 'teal', 'amber', 'rose', 'violet', 'indigo', 'orange', 'cyan', 'slate'] as const,
  tagline: 'Grow what you value. Keep the game simple. Play the long game.',
  defaultTemplates: [
    { label: 'Read 10 pages', xp: 10 },
    { label: 'Read (longer session)', xp: 15 },
    { label: 'Exercise', xp: 25 },
    { label: 'Study 30 min', xp: 30 },
    { label: 'Study 45 min without checking my phone', xp: 50 },
    { label: 'Complete priority / important task', xp: 50 },
    { label: 'Learn something difficult', xp: 75 },
    { label: 'Complete a major project', xp: 200 },
    { label: 'Boss battle', xp: 300 },
  ],
};

// ── Types ────────────────────────────────────────────────────────────────────
export type StatColor = (typeof ASCEND.colors)[number];
export type QuestType = 'daily' | 'side' | 'main';
export type CompletionKind = 'daily' | 'side' | 'focus' | 'milestone' | 'boss' | 'review';
export type Theme = 'system' | 'light' | 'dark';

export interface AStat { id: string; name: string; icon: string; color: StatColor; position: number }
export interface ASub { id: string; statId: string; name: string; note: string; position: number }
export interface AQuest {
  id: string; type: QuestType; title: string; statId: string; subId: string | null; xp: number;
  days: number[]; timed: boolean; due: string | null; target: string | null; doneAt: string | null;
  archived: boolean; createdOn: string; // local YYYY-MM-DD
}
export interface AMilestone { id: string; questId: string; title: string; xp: number; position: number; doneAt: string | null }
export interface ABoss {
  id: string; title: string; statId: string; subId: string | null; xp: number;
  avoidingSince: string | null; why: string; defeatedAt: string | null;
}
export interface ATicket { id: string; xp: number; title: string; claimedAt: string | null }
export interface AReview {
  id: string; localDate: string; weekStart: string; wins: string; slipped: string; focusStat: string | null; stoic: string;
}
export interface ACompletion {
  id: string; kind: CompletionKind; questId: string | null; milestoneId: string | null; bossId: string | null;
  reviewId: string | null; title: string; parentTitle: string | null; statId: string; subId: string | null;
  xp: number; minutes: number | null; localDate: string; createdAt: number;
}
export interface Template { label: string; xp: number }
export interface ASettings { theme: Theme; focusWork: number; focusBreak: number; templates: Template[] }
export interface AscendData {
  stats: AStat[]; subskills: ASub[]; quests: AQuest[]; milestones: AMilestone[]; bosses: ABoss[];
  tickets: ATicket[]; reviews: AReview[]; completions: ACompletion[]; settings: ASettings;
}

export function defaultSettings(): ASettings {
  return { theme: 'system', focusWork: ASCEND.focus.work, focusBreak: ASCEND.focus.brk, templates: ASCEND.defaultTemplates.map((t) => ({ ...t })) };
}
export function emptyData(): AscendData {
  return { stats: [], subskills: [], quests: [], milestones: [], bosses: [], tickets: [], reviews: [], completions: [], settings: defaultSettings() };
}

// ── Dates (YYYY-MM-DD keys, calendar arithmetic in UTC so the device zone never leaks in)
const toUtc = (k: string) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (k: string, n: number) => fromUtc(toUtc(k) + n * 86400000);
export const weekdayOf = (k: string) => new Date(toUtc(k)).getUTCDay(); // 0 = Sunday
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / 86400000);
export const weekStart = (k: string) => addDays(k, -((weekdayOf(k) + 6) % 7)); // Monday
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAYNAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

// ── Levels ───────────────────────────────────────────────────────────────────
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export function xpForLevel(n: number): number {
  const l = clamp(Math.floor(n), 1, ASCEND.maxLevel);
  return ASCEND.xpCurveK * (l - 1) * (l + 2);
}
export function levelFromXp(xp: number): number {
  const x = Math.max(0, xp || 0);
  let n = clamp(Math.floor((-1 + Math.sqrt(9 + (4 * x) / ASCEND.xpCurveK)) / 2), 1, ASCEND.maxLevel);
  while (n < ASCEND.maxLevel && xpForLevel(n + 1) <= x) n++;
  while (n > 1 && xpForLevel(n) > x) n--;
  return n;
}
export interface LevelInfo { level: number; xp: number; into: number; span: number; pct: number; toNext: number; max: boolean }
export function levelInfo(xp: number): LevelInfo {
  const x = Math.max(0, xp || 0);
  const level = levelFromXp(x);
  if (level >= ASCEND.maxLevel) return { level, xp: x, into: 0, span: 0, pct: 1, toNext: 0, max: true };
  const a = xpForLevel(level), b = xpForLevel(level + 1);
  return { level, xp: x, into: x - a, span: b - a, pct: (x - a) / (b - a), toNext: b - x, max: false };
}
export function titleFor(level: number): string {
  for (const [min, t] of ASCEND.titles) if (level >= min) return t;
  return 'Initiate';
}

// ── Totals ───────────────────────────────────────────────────────────────────
export interface Tally { total: number; stat: Record<string, number>; sub: Record<string, number> }
export function tally(d: Pick<AscendData, 'completions'>): Tally {
  const t: Tally = { total: 0, stat: {}, sub: {} };
  for (const c of d.completions) {
    t.total += c.xp;
    t.stat[c.statId] = (t.stat[c.statId] ?? 0) + c.xp;
    if (c.subId) t.sub[c.subId] = (t.sub[c.subId] ?? 0) + c.xp;
  }
  return t;
}

// ── Daily quests & streaks ───────────────────────────────────────────────────
export function dailyQuests(d: Pick<AscendData, 'quests'>, weekday?: number): AQuest[] {
  return d.quests.filter((q) => q.type === 'daily' && !q.archived && (weekday == null || q.days.includes(weekday)));
}
export function dailyCount(d: Pick<AscendData, 'quests'>, weekday: number, excludeId: string | null = null): number {
  return dailyQuests(d, weekday).filter((q) => q.id !== excludeId).length;
}
/** questId → set of local dates the daily was completed. */
export function doneIndex(d: Pick<AscendData, 'completions'>): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const c of d.completions) {
    if (c.kind !== 'daily' || !c.questId) continue;
    let s = m.get(c.questId);
    if (!s) m.set(c.questId, (s = new Set()));
    s.add(c.localDate);
  }
  return m;
}
export function firstDay(d: Pick<AscendData, 'completions' | 'quests'>, today: string): string {
  let k = today;
  for (const c of d.completions) if (c.localDate < k) k = c.localDate;
  for (const q of d.quests) if (q.createdOn && q.createdOn < k) k = q.createdOn;
  return k;
}
export interface DayRecord { scheduled: boolean; done: number; total: number; ok: boolean }
export function overallDay(d: Pick<AscendData, 'quests'>, key: string, idx: Map<string, Set<string>>): DayRecord {
  const qs = dailyQuests(d, weekdayOf(key)).filter((q) => !q.createdOn || q.createdOn <= key);
  if (!qs.length) return { scheduled: false, done: 0, total: 0, ok: false };
  const done = qs.filter((q) => idx.get(q.id)?.has(key)).length;
  return { scheduled: true, done, total: qs.length, ok: done >= Math.min(ASCEND.streakDayMinimum, qs.length) };
}
function recorder(d: Pick<AscendData, 'quests' | 'completions'>, questId: string | null) {
  const idx = doneIndex(d);
  if (!questId) return (k: string) => overallDay(d, k, idx);
  const q = d.quests.find((x) => x.id === questId);
  if (!q) return null;
  return (k: string): DayRecord => {
    if (!q.days.includes(weekdayOf(k)) || (q.createdOn && q.createdOn > k)) return { scheduled: false, done: 0, total: 0, ok: false };
    const ok = !!idx.get(q.id)?.has(k);
    return { scheduled: true, done: ok ? 1 : 0, total: 1, ok };
  };
}
/** Consecutive scheduled days completed. Today only counts once done; it never breaks a streak while in progress. */
export function currentStreak(d: Pick<AscendData, 'quests' | 'completions'>, today: string, questId: string | null = null): number {
  const rec = recorder(d, questId);
  if (!rec) return 0;
  const start = firstDay(d, today);
  let n = 0;
  const r0 = rec(today);
  if (r0.scheduled && r0.ok) n++;
  for (let k = addDays(today, -1); k >= start; k = addDays(k, -1)) {
    const r = rec(k);
    if (!r.scheduled) continue;
    if (r.ok) n++;
    else break;
  }
  return n;
}
export function bestStreak(d: Pick<AscendData, 'quests' | 'completions'>, today: string, questId: string | null = null): number {
  const rec = recorder(d, questId);
  if (!rec) return 0;
  let run = 0, best = 0;
  for (let k = firstDay(d, today); k <= today; k = addDays(k, 1)) {
    const r = rec(k);
    if (!r.scheduled) continue;
    if (r.ok) { run++; best = Math.max(best, run); }
    else if (k !== today) run = 0;
  }
  return best;
}
/** The most recent scheduled day (within a week) if it fell short, else null. */
export function lastScheduledMiss(d: Pick<AscendData, 'quests' | 'completions'>, today: string): string | null {
  const idx = doneIndex(d), start = firstDay(d, today);
  for (let i = 1; i <= 7; i++) {
    const k = addDays(today, -i);
    if (k < start) return null;
    const r = overallDay(d, k, idx);
    if (r.scheduled) return r.ok ? null : k;
  }
  return null;
}

// ── Golden Tickets ───────────────────────────────────────────────────────────
export type TicketState = 'locked' | 'ready' | 'claimed';
export interface TicketView extends ATicket { status: TicketState; pct: number; remaining: number }
export function ticketStatus(d: Pick<AscendData, 'tickets' | 'completions'>): TicketView[] {
  const total = tally(d).total;
  return [...d.tickets].sort((a, b) => a.xp - b.xp).map((t) => ({
    ...t,
    status: t.claimedAt ? 'claimed' : total >= t.xp ? 'ready' : 'locked',
    pct: clamp(total / t.xp, 0, 1),
    remaining: Math.max(0, t.xp - total),
  }));
}

// ── History ──────────────────────────────────────────────────────────────────
export function weekReviewed(d: Pick<AscendData, 'reviews'>, today: string): boolean {
  const w = weekStart(today);
  return d.reviews.some((r) => r.weekStart === w);
}
export interface LevelEvent { kind: 'overall' | 'stat'; statId?: string; level: number; date: string; ts: number }
export function levelUpEvents(d: Pick<AscendData, 'completions'>): LevelEvent[] {
  const sorted = [...d.completions].sort((a, b) => a.createdAt - b.createdAt);
  const ev: LevelEvent[] = [];
  let total = 0;
  const per: Record<string, number> = {};
  for (const c of sorted) {
    const before = levelFromXp(total);
    total += c.xp;
    const after = levelFromXp(total);
    if (after > before) ev.push({ kind: 'overall', level: after, date: c.localDate, ts: c.createdAt });
    const pb = levelFromXp(per[c.statId] ?? 0);
    per[c.statId] = (per[c.statId] ?? 0) + c.xp;
    const pa = levelFromXp(per[c.statId]);
    if (pa > pb) ev.push({ kind: 'stat', statId: c.statId, level: pa, date: c.localDate, ts: c.createdAt + 1 });
  }
  return ev.reverse();
}

/** Snapshot used to decide which celebrations an action earned. */
export interface LevelSnapshot { overall: number; stat: Record<string, number>; sub: Record<string, number>; ready: Set<string> }
export function snapshot(d: AscendData): LevelSnapshot {
  const t = tally(d);
  const s: LevelSnapshot = { overall: levelFromXp(t.total), stat: {}, sub: {}, ready: new Set(ticketStatus(d).filter((x) => x.status === 'ready').map((x) => x.id)) };
  for (const x of d.stats) s.stat[x.id] = levelFromXp(t.stat[x.id] ?? 0);
  for (const x of d.subskills) s.sub[x.id] = levelFromXp(t.sub[x.id] ?? 0);
  return s;
}

/** Soft nudge toward concrete quests ("Study 45 min…" rather than "Get better at…"). */
export const looksVague = (t: string) => /^\s*(get|be|become|improve|work on|try to|start being|more|better|less)\b/i.test(t || '');

/** "Title | 300" lines → milestones (XP defaults when missing). */
export function parseMilestones(text: string): Array<{ title: string; xp: number }> {
  return (text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [t, x] = l.split('|').map((s) => s.trim());
    const xp = parseInt(x ?? '', 10);
    return { title: t, xp: xp > 0 ? xp : ASCEND.defaultMilestoneXp };
  }).filter((m) => m.title);
}
