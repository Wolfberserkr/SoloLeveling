// Ascend client state: the player's data, today's date in their timezone,
// and the UI moments (sheets, toasts, celebrations, focus timer).
import { create } from 'zustand';
import { todayInTz } from '@/lib/dates';
import * as db from './db';
import {
  ASCEND, emptyData, levelFromXp, parseMilestones, snapshot, weekStart,
  type ABoss, type ACompletion, type AscendData, type ASettings, type LevelSnapshot, type StatColor,
} from './logic';

export type QuestKind = 'daily' | 'side' | 'main' | 'boss';
export interface QuestDraft {
  mode: 'new' | 'edit'; id?: string; kind: QuestKind; title: string; statId: string | null; subId: string | null;
  xp: string; days: number[]; timed: boolean; due: string; target: string; milestonesText: string; avoidingSince: string; why: string;
}
export type Sheet =
  | { kind: 'quest'; draft: QuestDraft }
  | { kind: 'main'; id: string }
  | { kind: 'ticket'; id: string }
  | { kind: 'review' }
  | { kind: 'focus' }
  | { kind: 'coach' };
export interface Toast { id: number; text: string; level?: boolean; action?: { label: string; run: () => void }; ms: number }
export type Modal = { kind: 'level'; level: number } | { kind: 'ticket'; ticketId: string } | { kind: 'boss'; boss: ABoss; xp: number };
export interface Float { id: number; x: number; y: number; xp: number; statId: string }
export interface Timer {
  questId: string; phase: 'idle' | 'work' | 'break' | 'done'; workMin: number; breakMin: number;
  running: boolean; accMs: number; resumedAt: number; sessionXp: number;
}
type At = { x: number; y: number } | null;

interface AscendState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  uid: string | null;
  tz: string | null;
  today: string;
  data: AscendData;
  sheet: Sheet | null;
  toasts: Toast[];
  modals: Modal[];
  floats: Float[];
  timer: Timer | null;
  levelGlow: number;

  init: (uid: string) => Promise<void>;
  syncToday: () => void;
  openSheet: (s: Sheet) => void;
  closeSheet: () => void;
  toast: (text: string, opts?: Partial<Omit<Toast, 'id' | 'text'>>) => void;
  dismissToast: (id: number) => void;
  closeModal: () => void;
  dropFloat: (id: number) => void;
  setTimer: (t: Timer | null) => void;

  complete: (questId: string, at?: At) => Promise<void>;
  awardFocus: (questId: string, minutes: number) => Promise<number>;
  toggleMilestone: (id: string, at?: At) => Promise<void>;
  defeat: (bossId: string) => Promise<void>;
  submitReview: (r: { wins: string; slipped: string; focusStat: string; stoic: string }) => Promise<string | null>;
  claim: (ticketId: string, claim?: boolean) => Promise<void>;
  removeCompletion: (id: string, label?: string) => Promise<void>;

  saveQuest: (d: QuestDraft) => Promise<string | null>;
  deleteQuest: (id: string) => Promise<void>;
  addMilestone: (questId: string, title: string, xp: number) => Promise<void>;
  deleteMilestone: (id: string) => Promise<void>;
  deleteBoss: (id: string) => Promise<void>;
  addTicket: (xp: number, title: string) => Promise<boolean>;
  saveTicket: (id: string, xp: number, title: string) => Promise<string | null>;
  deleteTicket: (id: string) => Promise<void>;
  updateStat: (id: string, patch: { name?: string; color?: StatColor }) => Promise<void>;
  addSub: (statId: string, name: string) => Promise<void>;
  renameSub: (id: string, name: string) => Promise<void>;
  deleteSub: (id: string) => Promise<void>;
  saveSettings: (patch: Partial<ASettings>) => Promise<void>;
}

let nextId = 1;

export const useAscend = create<AscendState>((set, get) => {
  /** Apply a data change, then queue whatever celebrations it earned. */
  function commit(next: AscendData, opts: { at?: At; xp?: number; statId?: string; boss?: ABoss; silent?: boolean } = {}) {
    const before: LevelSnapshot = snapshot(get().data);
    set({ data: next });
    if (opts.xp && opts.statId) {
      const at = opts.at ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.42 };
      set((s) => ({ floats: [...s.floats, { id: nextId++, x: at.x, y: at.y, xp: opts.xp!, statId: opts.statId! }] }));
    }
    if (opts.silent) return;
    const after = snapshot(next);
    const ups: string[] = [];
    for (const st of next.stats) if ((after.stat[st.id] ?? 1) > (before.stat[st.id] ?? 1)) ups.push(`${st.icon} ${st.name} reached level ${after.stat[st.id]}`);
    for (const sb of next.subskills) if ((after.sub[sb.id] ?? 1) > (before.sub[sb.id] ?? 1)) ups.push(`${sb.name} branch reached level ${after.sub[sb.id]}`);
    ups.slice(0, 2).forEach((u, i) => setTimeout(() => get().toast(u, { level: true }), 300 + i * 350));
    const modals: Modal[] = [];
    if (opts.boss) modals.push({ kind: 'boss', boss: opts.boss, xp: opts.xp ?? opts.boss.xp });
    if (after.overall > before.overall) { modals.push({ kind: 'level', level: after.overall }); set((s) => ({ levelGlow: s.levelGlow + 1 })); }
    for (const id of after.ready) if (!before.ready.has(id)) modals.push({ kind: 'ticket', ticketId: id });
    if (modals.length) set((s) => ({ modals: [...s.modals, ...modals] }));
  }

  function fail(e: unknown) { get().toast(db.errText(e)); }

  /** Local mirror of ascend_remove_completion. */
  function withoutCompletion(d: AscendData, c: ACompletion): AscendData {
    return {
      ...d,
      completions: d.completions.filter((x) => x.id !== c.id),
      quests: c.kind === 'side' ? d.quests.map((q) => (q.id === c.questId ? { ...q, doneAt: null } : q)) : d.quests,
      milestones: c.kind === 'milestone' ? d.milestones.map((m) => (m.id === c.milestoneId ? { ...m, doneAt: null } : m)) : d.milestones,
      bosses: c.kind === 'boss' ? d.bosses.map((b) => (b.id === c.bossId ? { ...b, defeatedAt: null } : b)) : d.bosses,
      reviews: c.kind === 'review' ? d.reviews.filter((r) => r.id !== c.reviewId) : d.reviews,
    };
  }

  function undoToast(text: string, c: ACompletion) {
    get().toast(text, { action: { label: 'Undo', run: () => void get().removeCompletion(c.id, 'Undone.') }, ms: ASCEND.undoMs });
  }

  return {
    status: 'loading',
    error: null,
    uid: null,
    tz: null,
    today: todayInTz(null),
    data: emptyData(),
    sheet: null,
    toasts: [],
    modals: [],
    floats: [],
    timer: null,
    levelGlow: 0,

    async init(uid) {
      set({ status: 'loading', error: null, uid });
      try {
        const tz = await db.loadTimezone(uid);
        set({ tz, today: todayInTz(tz) });
        await db.enroll(); // idempotent: seeds stats, branches and tickets on first visit
        const data = await db.loadAll(tz);
        set({ data, status: 'ready' });
      } catch (e) {
        set({ status: 'error', error: db.errText(e) });
      }
    },
    syncToday() {
      const t = todayInTz(get().tz);
      if (t !== get().today) set({ today: t });
    },

    openSheet: (sheet) => set({ sheet }),
    closeSheet: () => set({ sheet: null }),
    toast(text, opts = {}) {
      const t: Toast = { id: nextId++, text, ms: opts.ms ?? (opts.action ? ASCEND.undoMs : 2800), level: opts.level, action: opts.action };
      set((s) => ({ toasts: [...s.toasts, t].slice(-3) }));
      setTimeout(() => get().dismissToast(t.id), t.ms);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    closeModal: () => set((s) => ({ modals: s.modals.slice(1) })),
    dropFloat: (id) => set((s) => ({ floats: s.floats.filter((f) => f.id !== id) })),
    setTimer: (timer) => set({ timer }),

    async complete(questId, at) {
      const q = get().data.quests.find((x) => x.id === questId);
      if (!q) return;
      try {
        const c = await db.completeQuest(questId);
        const d = get().data;
        commit({
          ...d,
          completions: [...d.completions, c],
          quests: q.type === 'side' ? d.quests.map((x) => (x.id === q.id ? { ...x, doneAt: c.localDate } : x)) : d.quests,
        }, { at, xp: c.xp, statId: c.statId });
        undoToast(`${c.title} · +${c.xp} XP`, c);
      } catch (e) { fail(e); }
    },
    async awardFocus(questId, minutes) {
      try {
        const c = await db.completeQuest(questId, minutes);
        const d = get().data;
        commit({ ...d, completions: [...d.completions, c] }, { xp: c.xp, statId: c.statId });
        get().toast(`Focus: ${minutes} min · +${c.xp} XP`);
        return c.xp;
      } catch (e) { fail(e); return 0; }
    },
    async toggleMilestone(id, at) {
      const m = get().data.milestones.find((x) => x.id === id);
      if (!m) return;
      try {
        const c = await db.toggleMilestone(id);
        const d = get().data;
        if (!c) {
          commit({ ...d, milestones: d.milestones.map((x) => (x.id === id ? { ...x, doneAt: null } : x)), completions: d.completions.filter((x) => x.milestoneId !== id) }, { silent: true });
          get().toast('Milestone reopened');
          return;
        }
        commit({ ...d, milestones: d.milestones.map((x) => (x.id === id ? { ...x, doneAt: c.localDate } : x)), completions: [...d.completions, c] }, { at, xp: c.xp, statId: c.statId });
        undoToast(`${c.title} · +${c.xp} XP`, c);
      } catch (e) { fail(e); }
    },
    async defeat(bossId) {
      const b = get().data.bosses.find((x) => x.id === bossId);
      if (!b) return;
      try {
        const c = await db.defeatBoss(bossId);
        const d = get().data;
        commit({ ...d, bosses: d.bosses.map((x) => (x.id === bossId ? { ...x, defeatedAt: c.localDate } : x)), completions: [...d.completions, c] }, { xp: c.xp, statId: c.statId, boss: b });
        undoToast(`Boss defeated · +${c.xp} XP`, c);
      } catch (e) { fail(e); }
    },
    async submitReview(r) {
      try {
        const c = await db.submitReview(r);
        const d = get().data;
        const today = get().today;
        const review = { id: c.reviewId ?? `r_${c.id}`, localDate: c.localDate, weekStart: weekStart(today), ...r };
        commit({ ...d, reviews: [review, ...d.reviews], completions: [...d.completions, c] }, { xp: c.xp, statId: c.statId });
        get().toast(`Weekly review done · +${c.xp} XP to Reflection`);
        return null;
      } catch (e) { return db.errText(e); }
    },
    async claim(ticketId, claim = true) {
      try {
        const t = await db.claimTicket(ticketId, claim);
        const d = get().data;
        commit({ ...d, tickets: d.tickets.map((x) => (x.id === t.id ? t : x)) }, { silent: true });
        if (claim) get().toast(`Claimed: ${t.title}. Enjoy it.`);
      } catch (e) { fail(e); }
    },
    async removeCompletion(id, label = 'Entry removed') {
      const c = get().data.completions.find((x) => x.id === id);
      if (!c) return;
      try {
        await db.removeCompletion(id);
        commit(withoutCompletion(get().data, c), { silent: true });
        get().toast(label);
      } catch (e) { fail(e); }
    },

    async saveQuest(dr) {
      const { tz } = get();
      const xp = parseInt(dr.xp, 10);
      try {
        const d = get().data;
        if (dr.kind === 'boss') {
          const input: db.BossInput = { title: dr.title.trim(), statId: dr.statId!, subId: dr.subId, xp: xp > 0 ? xp : ASCEND.bossDefaultXp, avoidingSince: dr.avoidingSince || null, why: dr.why.trim() };
          if (dr.mode === 'edit' && dr.id) {
            const b = await db.updateBoss(dr.id, input);
            set({ data: { ...d, bosses: d.bosses.map((x) => (x.id === b.id ? b : x)) } });
          } else {
            const b = await db.insertBoss(input);
            set({ data: { ...d, bosses: [...d.bosses, b] } });
          }
          return null;
        }
        const input: db.QuestInput = {
          type: dr.kind, title: dr.title.trim(), statId: dr.statId!, subId: dr.subId,
          xp: dr.kind === 'main' ? 0 : xp, days: dr.kind === 'daily' ? [...dr.days].sort((a, b) => a - b) : [],
          timed: dr.kind !== 'main' && dr.timed, due: dr.kind === 'side' ? dr.due || null : null, target: dr.kind === 'main' ? dr.target || null : null,
        };
        if (dr.mode === 'edit' && dr.id) {
          const { type: _type, ...patch } = input;
          void _type;
          const q = await db.updateQuest(dr.id, patch, tz);
          set({ data: { ...d, quests: d.quests.map((x) => (x.id === q.id ? q : x)) } });
        } else {
          const q = await db.insertQuest(input, tz);
          let milestones = d.milestones;
          if (dr.kind === 'main') {
            const ms = await db.insertMilestones(q.id, parseMilestones(dr.milestonesText).map((m, i) => ({ ...m, position: i })));
            milestones = [...milestones, ...ms];
          }
          set({ data: { ...get().data, quests: [...get().data.quests, q], milestones } });
        }
        return null;
      } catch (e) {
        return db.errText(e);
      }
    },
    async deleteQuest(id) {
      try {
        await db.deleteQuest(id);
        const d = get().data;
        set({ data: { ...d, quests: d.quests.filter((q) => q.id !== id), milestones: d.milestones.filter((m) => m.questId !== id) } });
        get().toast('Quest deleted. Earned XP is kept.');
      } catch (e) { fail(e); }
    },
    async addMilestone(questId, title, xp) {
      const d = get().data;
      const pos = d.milestones.filter((m) => m.questId === questId).reduce((a, m) => Math.max(a, m.position + 1), 0);
      try {
        const [m] = await db.insertMilestones(questId, [{ title, xp, position: pos }]);
        set({ data: { ...get().data, milestones: [...get().data.milestones, m] } });
      } catch (e) { fail(e); }
    },
    async deleteMilestone(id) {
      try {
        await db.deleteMilestone(id);
        set({ data: { ...get().data, milestones: get().data.milestones.filter((m) => m.id !== id) } });
      } catch (e) { fail(e); }
    },
    async deleteBoss(id) {
      try {
        await db.deleteBoss(id);
        set({ data: { ...get().data, bosses: get().data.bosses.filter((b) => b.id !== id) } });
        get().toast('Boss removed. Earned XP is kept.');
      } catch (e) { fail(e); }
    },
    async addTicket(xp, title) {
      try {
        const t = await db.insertTicket(xp, title);
        commit({ ...get().data, tickets: [...get().data.tickets, t] });
        get().toast('Golden Ticket added');
        return true;
      } catch (e) { fail(e); return false; }
    },
    async saveTicket(id, xp, title) {
      try {
        const t = await db.updateTicket(id, xp, title);
        commit({ ...get().data, tickets: get().data.tickets.map((x) => (x.id === id ? t : x)) });
        return null;
      } catch (e) { return db.errText(e); }
    },
    async deleteTicket(id) {
      try {
        await db.deleteTicket(id);
        set({ data: { ...get().data, tickets: get().data.tickets.filter((t) => t.id !== id) } });
        get().toast('Ticket deleted');
      } catch (e) { fail(e); }
    },
    async updateStat(id, patch) {
      const prev = get().data;
      set({ data: { ...prev, stats: prev.stats.map((s) => (s.id === id ? { ...s, ...patch } : s)) } });
      try { await db.updateStat(id, patch); } catch (e) { set({ data: prev }); fail(e); }
    },
    async addSub(statId, name) {
      const d = get().data;
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'branch';
      const id = `${statId}.${slug}-${Math.random().toString(36).slice(2, 6)}`;
      const pos = d.subskills.filter((s) => s.statId === statId).reduce((a, s) => Math.max(a, s.position + 1), 0);
      try {
        const sub = await db.insertSub(statId, id, name, pos);
        set({ data: { ...get().data, subskills: [...get().data.subskills, sub] } });
        get().toast('Branch added');
      } catch (e) { fail(e); }
    },
    async renameSub(id, name) {
      const prev = get().data;
      set({ data: { ...prev, subskills: prev.subskills.map((s) => (s.id === id ? { ...s, name } : s)) } });
      try { await db.updateSub(id, name); } catch (e) { set({ data: prev }); fail(e); }
    },
    async deleteSub(id) {
      try {
        await db.deleteSub(id);
        const d = get().data;
        set({ data: { ...d, subskills: d.subskills.filter((s) => s.id !== id), quests: d.quests.map((q) => (q.subId === id ? { ...q, subId: null } : q)) } });
        get().toast('Branch removed. Its XP still counts toward the stat.');
      } catch (e) { fail(e); }
    },
    async saveSettings(patch) {
      const { uid } = get();
      const prev = get().data;
      const settings = { ...prev.settings, ...patch };
      set({ data: { ...prev, settings } });
      if (!uid) return;
      try { await db.saveSettings(uid, settings); } catch (e) { fail(e); }
    },
  };
});

/** Lifetime level for the header and nav — cheap enough to compute on render. */
export const overallLevel = (d: AscendData) => levelFromXp(d.completions.reduce((a, c) => a + c.xp, 0));

/** Open the Focus Timer for a quest (one running session at a time). */
export function openFocus(questId: string) {
  const s = useAscend.getState();
  if (s.timer && s.timer.questId !== questId && s.timer.phase === 'work') {
    s.toast('A focus session is already running.');
    s.openSheet({ kind: 'focus' });
    return;
  }
  if (!s.timer || s.timer.questId !== questId) {
    s.setTimer({ questId, phase: 'idle', workMin: s.data.settings.focusWork, breakMin: s.data.settings.focusBreak, running: false, accMs: 0, resumedAt: 0, sessionXp: 0 });
  }
  s.openSheet({ kind: 'focus' });
}
