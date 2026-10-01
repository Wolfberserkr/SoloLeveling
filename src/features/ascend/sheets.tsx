// Bottom sheets (centered dialogs on desktop): quest form, main-quest detail,
// ticket editor, weekly review and the Focus Timer.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ASCEND, dailyCount, looksVague, weekStart, DAYNAMES, DAYS, WEEK_ORDER,
} from './logic';
import { useAscend, type QuestDraft, type QuestKind } from './store';
import { Empty, Icon, Ring, cvar, fmt, fmtDate, statLabel, statVar, useConfirm } from './ui';
import { editDraft } from './drafts';

export function SheetHost() {
  const sheet = useAscend((s) => s.sheet);
  const close = useAscend((s) => s.closeSheet);
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, close]);
  if (!sheet) return null;
  let body: ReactNode = null;
  if (sheet.kind === 'quest') body = <QuestForm key={sheet.draft.id ?? `new-${sheet.draft.kind}`} initial={sheet.draft} />;
  else if (sheet.kind === 'main') body = <MainDetail id={sheet.id} />;
  else if (sheet.kind === 'ticket') body = <TicketForm id={sheet.id} />;
  else if (sheet.kind === 'review') body = <ReviewForm />;
  else body = <FocusTimer />;
  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={sheet.kind}>{body}</div>
    </>
  );
}

function Head({ eyebrow, title, extra }: { eyebrow: ReactNode; title: ReactNode; extra?: ReactNode }) {
  const close = useAscend((s) => s.closeSheet);
  return (
    <div className="sheet-head">
      <div className="grow"><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div>
      {extra}
      <button className="iconbtn" aria-label="Close" onClick={close}><Icon name="x" /></button>
    </div>
  );
}

// ── Quest form ───────────────────────────────────────────────────────────────
function QuestForm({ initial }: { initial: QuestDraft }) {
  const data = useAscend((s) => s.data);
  const saveQuest = useAscend((s) => s.saveQuest);
  const deleteQuest = useAscend((s) => s.deleteQuest);
  const deleteBoss = useAscend((s) => s.deleteBoss);
  const openSheet = useAscend((s) => s.openSheet);
  const close = useAscend((s) => s.closeSheet);
  const toast = useAscend((s) => s.toast);
  const confirm = useConfirm();
  const [d, setD] = useState<QuestDraft>(initial);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const title = useRef<HTMLInputElement>(null);
  const isEdit = d.mode === 'edit';
  const subs = d.statId ? data.subskills.filter((s) => s.statId === d.statId).sort((a, b) => a.position - b.position) : [];
  const set = (patch: Partial<QuestDraft>) => { setD({ ...d, ...patch }); setMsg(''); };
  useEffect(() => { if (!isEdit) setTimeout(() => title.current?.focus(), 80); }, [isEdit]);

  function toggleDay(wd: number) {
    if (d.days.includes(wd)) { set({ days: d.days.filter((x) => x !== wd) }); return; }
    if (dailyCount(data, wd, isEdit ? d.id ?? null : null) >= ASCEND.daily.max) {
      setMsg(`${DAYNAMES[wd]} already has ${ASCEND.daily.max} daily quests. Keeping each day to ${ASCEND.daily.min}–${ASCEND.daily.max} non-negotiables is what keeps the game simple. Swap one out first, or make this a side quest.`);
      return;
    }
    set({ days: [...d.days, wd] });
  }
  function setKind(kind: QuestKind) {
    const patch: Partial<QuestDraft> = { kind };
    if (kind === 'boss' && !d.xp) patch.xp = String(ASCEND.bossDefaultXp);
    set(patch);
  }

  async function save() {
    if (!d.title.trim()) return setMsg('Give the quest a name: a concrete action you can finish.');
    if (!d.statId) return setMsg('Pick the stat this quest grows.');
    if (d.kind !== 'main' && !(parseInt(d.xp, 10) > 0)) return setMsg('Pick an XP value from the templates or type your own.');
    if (d.kind === 'daily') {
      if (!d.days.length) return setMsg('Pick at least one weekday.');
      const full = d.days.filter((wd) => dailyCount(data, wd, isEdit ? d.id ?? null : null) >= ASCEND.daily.max);
      if (full.length) return setMsg(`${full.map((w) => DAYNAMES[w]).join(', ')} already ${full.length > 1 ? 'have' : 'has'} ${ASCEND.daily.max} daily quests. Swap one out first, or make this a side quest.`);
    }
    setBusy(true);
    const err = await saveQuest(d);
    setBusy(false);
    if (err) return setMsg(err);
    if (isEdit && d.kind === 'main' && d.id) openSheet({ kind: 'main', id: d.id });
    else close();
    toast(isEdit ? 'Saved' : d.kind === 'boss' ? 'Boss named. Face it when you are ready.' : 'Quest added');
    if (d.kind === 'daily') {
      const thin = d.days.filter((wd) => dailyCount(useAscend.getState().data, wd) < ASCEND.daily.min);
      if (thin.length) setTimeout(() => toast(`${thin.map((w) => DAYS[w]).join(', ')} still under ${ASCEND.daily.min} daily quests.`), 600);
    }
  }
  async function remove() {
    if (!d.id || !confirm.tap('del')) return;
    close();
    if (d.kind === 'boss') await deleteBoss(d.id); else await deleteQuest(d.id);
  }

  const vague = looksVague(d.title) && d.kind !== 'main';
  return (
    <>
      <Head eyebrow={`${isEdit ? 'Edit' : 'New'} ${d.kind === 'boss' ? 'boss battle' : `${d.kind} quest`}`} title={isEdit ? d.title || 'Quest' : 'What will you do?'} />
      <div className="form">
        {!isEdit && (
          <div className="seg" role="tablist" aria-label="Quest type">
            {(['daily', 'side', 'main', 'boss'] as QuestKind[]).map((k) => (
              <button key={k} role="tab" className="seg-btn" aria-selected={d.kind === k} onClick={() => setKind(k)}>{k === 'boss' && <Icon name="flame" />}{k[0].toUpperCase() + k.slice(1)}</button>
            ))}
          </div>
        )}
        <label className="field">
          <span className="flabel">{d.kind === 'boss' ? 'The thing you have been avoiding' : d.kind === 'main' ? 'Long-term goal' : 'Quest'}</span>
          <input ref={title} id="qf-title" value={d.title} autoComplete="off" onChange={(e) => set({ title: e.target.value })}
            placeholder={d.kind === 'boss' ? 'e.g. Ask for the meeting about the promotion' : d.kind === 'main' ? 'e.g. Run a half marathon' : 'e.g. Study 45 min without my phone'} />
          {vague && <span className="hint nudge">Make it something you can finish and tick off. "Study 45 min without my phone" beats "Get better at studying".</span>}
        </label>
        <div className="field"><span className="flabel">Stat</span>
          <div className="chips">{data.stats.map((s) => (
            <button key={s.id} className="chip" style={{ '--c': cvar(s.color) } as React.CSSProperties} aria-pressed={d.statId === s.id} onClick={() => set({ statId: s.id, subId: d.statId === s.id ? d.subId : null })}>{s.icon} {s.name}</button>
          ))}</div>
        </div>
        {subs.length > 0 && (
          <div className="field"><span className="flabel">Sub-skill <em>optional</em></span>
            <div className="chips" style={statVar(data, d.statId)}>
              <button className="chip" aria-pressed={!d.subId} onClick={() => set({ subId: null })}>None</button>
              {subs.map((x) => <button key={x.id} className="chip" aria-pressed={d.subId === x.id} onClick={() => set({ subId: x.id })}>{x.name}</button>)}
            </div>
          </div>
        )}
        {d.kind === 'daily' && (
          <div className="field"><span className="flabel">Repeats on</span>
            <div className="chips">{WEEK_ORDER.map((wd) => {
              const c = dailyCount(data, wd, isEdit ? d.id ?? null : null), on = d.days.includes(wd);
              return <button key={wd} className={`chip${!on && c >= ASCEND.daily.max ? ' full' : ''}`} aria-pressed={on} aria-label={`${DAYNAMES[wd]}, ${c} of ${ASCEND.daily.max} already`} onClick={() => toggleDay(wd)}>{DAYS[wd]} <span className="n">{c + (on ? 1 : 0)}/{ASCEND.daily.max}</span></button>;
            })}</div>
            <span className="hint">{ASCEND.daily.min}–{ASCEND.daily.max} non-negotiables per day keeps the system simple.</span>
          </div>
        )}
        {d.kind !== 'main' && (
          <div className="field"><span className="flabel">XP</span>
            <div className="chips">{data.settings.templates.map((t, i) => <button key={i} className="chip" aria-pressed={parseInt(d.xp, 10) === t.xp} onClick={() => set({ xp: String(t.xp) })}>{t.label} <span className="n">{t.xp}</span></button>)}</div>
            <div className="xprow"><input id="qf-xp" className="num" type="number" inputMode="numeric" min={1} max={1000} value={d.xp} placeholder="Custom" aria-label="Custom XP" onChange={(e) => set({ xp: e.target.value })} /><span className="muted" style={{ fontSize: 13 }}>XP</span></div>
          </div>
        )}
        {(d.kind === 'daily' || d.kind === 'side') && (
          <label className="toggle"><input type="checkbox" id="qf-timed" checked={d.timed} onChange={(e) => set({ timed: e.target.checked })} />
            <span>Use the Focus Timer <span className="muted">· {ASCEND.focus.xpPerMinute} XP per focused minute, up to {ASCEND.focus.capPerSession}</span></span></label>
        )}
        {d.kind === 'side' && <label className="field"><span className="flabel">Due date <em>optional</em></span><input id="qf-due" type="date" value={d.due} onChange={(e) => set({ due: e.target.value })} /></label>}
        {d.kind === 'main' && (
          <>
            <label className="field"><span className="flabel">Target date <em>optional</em></span><input id="qf-target" type="date" value={d.target} onChange={(e) => set({ target: e.target.value })} /></label>
            {isEdit ? <p className="hint">Edit milestones from the quest itself.</p> : (
              <label className="field"><span className="flabel">Milestones, in order</span>
                <textarea id="qf-ms" value={d.milestonesText} onChange={(e) => set({ milestonesText: e.target.value })} placeholder={'One per line. Add XP after a bar:\nSign up for the race | 50\nRun 10 km | 100\nRace day | 300'} />
                <span className="hint">No XP given means {ASCEND.defaultMilestoneXp} XP.</span></label>
            )}
          </>
        )}
        {d.kind === 'boss' && (
          <>
            <label className="field"><span className="flabel">Avoiding since</span><input id="qf-since" type="date" value={d.avoidingSince} onChange={(e) => set({ avoidingSince: e.target.value })} /></label>
            <label className="field"><span className="flabel">Why it matters</span><textarea id="qf-why" value={d.why} placeholder="What changes once this is done?" onChange={(e) => set({ why: e.target.value })} /></label>
          </>
        )}
        {msg && <p className="formmsg" role="alert">{msg}</p>}
        <div className="sheet-actions">
          {isEdit && <button className={`btn ${confirm.armed === 'del' ? 'armed' : 'ghost danger'}`} onClick={() => void remove()}>{confirm.armed === 'del' ? 'Tap again to delete' : <><Icon name="trash" />Delete</>}</button>}
          <span className="sp" />
          <button className="btn ghost" onClick={close}>Cancel</button>
          <button className={`btn ${d.kind === 'boss' ? 'ember' : 'primary'}`} disabled={busy} onClick={() => void save()}>{isEdit ? 'Save' : d.kind === 'boss' ? 'Name the boss' : 'Add quest'}</button>
        </div>
      </div>
    </>
  );
}

// ── Main quest detail ────────────────────────────────────────────────────────
function MainDetail({ id }: { id: string }) {
  const data = useAscend((s) => s.data);
  const toggle = useAscend((s) => s.toggleMilestone);
  const addMilestone = useAscend((s) => s.addMilestone);
  const deleteMilestone = useAscend((s) => s.deleteMilestone);
  const deleteQuest = useAscend((s) => s.deleteQuest);
  const openSheet = useAscend((s) => s.openSheet);
  const close = useAscend((s) => s.closeSheet);
  const confirm = useConfirm();
  const [title, setTitle] = useState('');
  const [xp, setXp] = useState('');
  const q = data.quests.find((x) => x.id === id);
  if (!q) return <Empty icon="star" title="Quest not found">It may have been deleted.</Empty>;
  const ms = data.milestones.filter((m) => m.questId === id).sort((a, b) => a.position - b.position);
  const done = ms.filter((m) => m.doneAt).length;
  return (
    <div style={statVar(data, q.statId)}>
      <Head eyebrow={`Main quest · ${statLabel(data, q.statId, q.subId)}`} title={q.title} extra={<Ring pct={ms.length ? done / ms.length : 0} size={64} stroke={7} />} />
      <p className="muted" style={{ fontSize: 13, marginTop: -8, marginBottom: 12 }}>{done} of {ms.length} milestones{q.target ? ` · target ${fmtDate(q.target, true)}` : ''}</p>
      <ol className="qlist" style={{ marginBottom: 14 }}>
        {ms.map((m) => (
          <li key={m.id} className={`qrow${m.doneAt ? ' is-done' : ''}`}>
            <button className="check" aria-pressed={!!m.doneAt} aria-label={`${m.doneAt ? 'Reopen' : 'Complete'}: ${m.title}`} onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              void toggle(m.id, { x: r.left + r.width / 2, y: r.top - 6 });
            }}><Icon name="check" /></button>
            <span className="qmain"><span className="qtitle">{m.title}</span>{m.doneAt && <span className="qmeta">Done {fmtDate(m.doneAt, true)}</span>}</span>
            <span className="xp num">+{m.xp}</span>
            {!m.doneAt && (confirm.armed === m.id
              ? <button className="btn sm armed" onClick={() => { if (confirm.tap(m.id)) void deleteMilestone(m.id); }}>Remove</button>
              : <button className="iconbtn sm" aria-label="Remove milestone" onClick={() => confirm.tap(m.id)}><Icon name="x" /></button>)}
          </li>
        ))}
      </ol>
      {!ms.length && <p className="muted" style={{ marginBottom: 12, fontSize: 14 }}>Break the goal into steps you can finish one at a time.</p>}
      <form className="field" style={{ marginBottom: 16 }} onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        void addMilestone(id, title.trim(), parseInt(xp, 10) > 0 ? parseInt(xp, 10) : ASCEND.defaultMilestoneXp);
        setTitle(''); setXp('');
      }}>
        <span className="flabel">Add a milestone</span>
        <div className="addrow" style={{ gridTemplateColumns: 'minmax(0,1fr) 86px auto' }}>
          <input className="input" id="ms-new-title" placeholder="Next concrete step" aria-label="Milestone" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input num" id="ms-new-xp" type="number" min={1} placeholder={String(ASCEND.defaultMilestoneXp)} aria-label="XP" value={xp} onChange={(e) => setXp(e.target.value)} />
          <button className="btn" type="submit">Add</button>
        </div>
      </form>
      <div className="sheet-actions">
        <button className={`btn ${confirm.armed === 'q' ? 'armed' : 'ghost danger'}`} onClick={() => { if (confirm.tap('q')) { close(); void deleteQuest(id); } }}>{confirm.armed === 'q' ? 'Tap again to delete' : <><Icon name="trash" />Delete quest</>}</button>
        <span className="sp" />
        <button className="btn" onClick={() => openSheet({ kind: 'quest', draft: editDraft(q) })}><Icon name="edit" />Edit details</button>
      </div>
    </div>
  );
}

// ── Ticket editor ────────────────────────────────────────────────────────────
function TicketForm({ id }: { id: string }) {
  const data = useAscend((s) => s.data);
  const saveTicket = useAscend((s) => s.saveTicket);
  const deleteTicket = useAscend((s) => s.deleteTicket);
  const claim = useAscend((s) => s.claim);
  const close = useAscend((s) => s.closeSheet);
  const confirm = useConfirm();
  const t = data.tickets.find((x) => x.id === id);
  const [xp, setXp] = useState(String(t?.xp ?? ''));
  const [title, setTitle] = useState(t?.title ?? '');
  const [msg, setMsg] = useState('');
  if (!t) return <Empty icon="ticket" title="Ticket not found">It may have been deleted.</Empty>;
  async function save() {
    const n = parseInt(xp, 10);
    if (!(n > 0) || !title.trim()) return setMsg('Both an XP milestone and a reward are needed.');
    const err = await saveTicket(id, n, title.trim());
    if (err) setMsg(err); else close();
  }
  return (
    <>
      <Head eyebrow="Golden Ticket" title={t.title} />
      <div className="form">
        <label className="field"><span className="flabel">Unlocks at lifetime XP</span><input id="tf-xp" className="num" type="number" min={1} value={xp} onChange={(e) => setXp(e.target.value)} /></label>
        <label className="field"><span className="flabel">Reward</span><input id="tf-title" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        {t.claimedAt && <p className="hint">Claimed {fmtDate(t.claimedAt, true)}.</p>}
        {msg && <p className="formmsg" role="alert">{msg}</p>}
        <div className="sheet-actions">
          <button className={`btn ${confirm.armed === 'd' ? 'armed' : 'ghost danger'}`} onClick={() => { if (confirm.tap('d')) { close(); void deleteTicket(id); } }}>{confirm.armed === 'd' ? 'Tap again to delete' : <><Icon name="trash" />Delete</>}</button>
          {t.claimedAt && <button className="btn ghost" onClick={() => { void claim(id, false); close(); }}>Mark unclaimed</button>}
          <span className="sp" />
          <button className="btn primary" onClick={() => void save()}>Save</button>
        </div>
      </div>
    </>
  );
}

// ── Weekly review ────────────────────────────────────────────────────────────
function ReviewForm() {
  const data = useAscend((s) => s.data);
  const today = useAscend((s) => s.today);
  const submit = useAscend((s) => s.submitReview);
  const close = useAscend((s) => s.closeSheet);
  const [r, setR] = useState({ wins: '', slipped: '', focusStat: '', stoic: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const ws = weekStart(today), comps = data.completions.filter((c) => c.localDate >= ws);
  const xp = comps.reduce((a, c) => a + c.xp, 0);
  const by: Record<string, number> = {};
  for (const c of comps) by[c.statId] = (by[c.statId] ?? 0) + c.xp;
  const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
  async function save() {
    if (!r.wins.trim() && !r.slipped.trim() && !r.stoic.trim()) return setMsg('Write a line or two in at least one box. Short is fine.');
    if (!r.focusStat) return setMsg('Pick one stat to focus on next week.');
    setBusy(true);
    const err = await submit({ wins: r.wins.trim(), slipped: r.slipped.trim(), focusStat: r.focusStat, stoic: r.stoic.trim() });
    setBusy(false);
    if (err) setMsg(err); else close();
  }
  return (
    <>
      <Head eyebrow={<span style={{ color: 'var(--c-indigo)' }}>Weekly review · week of {fmtDate(ws)}</span>} title="Look back, then look ahead" />
      <p className="muted" style={{ fontSize: 13, marginTop: -8, marginBottom: 14 }}><span className="num">{fmt(xp)}</span> XP from {comps.length} quests this week{top ? ` · most in ${data.stats.find((s) => s.id === top[0])?.name ?? ''}` : ''}</p>
      <div className="form">
        <label className="field"><span className="flabel">Wins this week</span><textarea id="rv-wins" autoFocus placeholder="What went well, however small?" value={r.wins} onChange={(e) => setR({ ...r, wins: e.target.value })} /></label>
        <label className="field"><span className="flabel">What slipped</span><textarea id="rv-slip" placeholder="No judgement. What got in the way?" value={r.slipped} onChange={(e) => setR({ ...r, slipped: e.target.value })} /></label>
        <div className="field"><span className="flabel">One focus stat for next week</span>
          <div className="chips">{data.stats.map((s) => <button key={s.id} className="chip" style={{ '--c': cvar(s.color) } as React.CSSProperties} aria-pressed={r.focusStat === s.id} onClick={() => setR({ ...r, focusStat: s.id })}>{s.icon} {s.name}</button>)}</div>
        </div>
        <label className="field"><span className="flabel">One Stoic reflection</span><textarea id="rv-stoic" placeholder="What was in my control this week, and what wasn't?" value={r.stoic} onChange={(e) => setR({ ...r, stoic: e.target.value })} /></label>
        {msg && <p className="formmsg" role="alert">{msg}</p>}
        <div className="sheet-actions"><span className="sp" /><button className="btn ghost" onClick={close}>Later</button><button className="btn primary" disabled={busy} onClick={() => void save()}>Complete review · +{ASCEND.reviewXp} XP</button></div>
      </div>
    </>
  );
}

// ── Focus timer ──────────────────────────────────────────────────────────────
export const fmtClock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
export function timerRemaining(t: NonNullable<ReturnType<typeof useAscend.getState>['timer']>, now = Date.now()) {
  const elapsed = t.accMs + (t.running ? now - t.resumedAt : 0);
  if (t.phase === 'idle') return t.workMin * 60000;
  if (t.phase === 'done') return 0;
  return (t.phase === 'break' ? t.breakMin : t.workMin) * 60000 - elapsed;
}

/** Ticks the running timer and awards XP when a focus block ends. Mounted once in the shell. */
export function useFocusTicker() {
  const timer = useAscend((s) => s.timer);
  const [, force] = useState(0);
  useEffect(() => {
    if (!timer || !timer.running) return;
    const id = setInterval(() => {
      const t = useAscend.getState().timer;
      if (!t || !t.running) return;
      if (timerRemaining(t) <= 0) void endPhase(false);
      else force((n) => n + 1);
    }, 250);
    return () => clearInterval(id);
  }, [timer]);
}

async function endPhase(early: boolean) {
  const s = useAscend.getState();
  const t = s.timer;
  if (!t) return;
  if (t.phase === 'work') {
    const elapsed = t.accMs + (t.running ? Date.now() - t.resumedAt : 0);
    const mins = early ? Math.floor(elapsed / 60000) : t.workMin;
    s.setTimer({ ...t, phase: 'break', accMs: 0, resumedAt: Date.now(), running: true });
    if (mins >= 1) {
      const xp = await s.awardFocus(t.questId, mins);
      const cur = useAscend.getState().timer;
      if (cur) useAscend.getState().setTimer({ ...cur, sessionXp: cur.sessionXp + xp });
    } else s.toast('Focus for at least a minute to earn XP.');
  } else {
    s.setTimer({ ...t, phase: 'done', running: false, accMs: 0 });
  }
}

function FocusTimer() {
  const timer = useAscend((s) => s.timer);
  const data = useAscend((s) => s.data);
  const setTimer = useAscend((s) => s.setTimer);
  const close = useAscend((s) => s.closeSheet);
  const toast = useAscend((s) => s.toast);
  const [work, setWork] = useState(String(timer?.workMin ?? data.settings.focusWork));
  const [brk, setBrk] = useState(String(timer?.breakMin ?? data.settings.focusBreak));
  const q = timer ? data.quests.find((x) => x.id === timer.questId) : null;
  if (!timer || !q) return <Empty icon="timer" title="No focus session">Start one from a timed quest.</Empty>;
  const rem = timerRemaining(timer);
  const total = (timer.phase === 'break' ? timer.breakMin : timer.workMin) * 60000;
  const frac = timer.phase === 'work' || timer.phase === 'break' ? 1 - rem / total : timer.phase === 'done' ? 1 : 0;
  const C = 2 * Math.PI * 96;
  const start = () => {
    const w = Math.max(1, Math.min(120, parseInt(work, 10) || data.settings.focusWork));
    const b = Math.max(1, Math.min(60, parseInt(brk, 10) || data.settings.focusBreak));
    setTimer({ ...timer, workMin: w, breakMin: b, phase: 'work', running: true, accMs: 0, resumedAt: Date.now() });
  };
  const phaseLabel = { idle: 'Ready', work: 'Focus', break: 'Break', done: 'Session complete' }[timer.phase];
  return (
    <div className="focus" style={statVar(data, q.statId)}>
      <div style={{ width: '100%', textAlign: 'left' }}><Head eyebrow={`Focus timer · ${statLabel(data, q.statId, q.subId)}`} title={q.title} /></div>
      <div className="ringwrap">
        <svg viewBox="0 0 220 220" aria-hidden="true">
          <circle cx="110" cy="110" r="96" style={{ fill: 'none', stroke: 'var(--surface-2)' }} strokeWidth={12} />
          <circle cx="110" cy="110" r="96" style={{ fill: 'none', stroke: timer.phase === 'break' ? 'var(--faint)' : 'var(--c)' }} strokeWidth={12} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * frac} />
        </svg>
        <div className="center"><span className="t" aria-live="off">{fmtClock(rem)}</span><span className="p">{phaseLabel}</span></div>
      </div>
      {(timer.phase === 'idle' || timer.phase === 'done') && (
        <div className="lens">
          <label className="field"><span className="flabel">Focus min</span><input id="tm-work" className="num" type="number" min={1} max={120} value={work} onChange={(e) => setWork(e.target.value)} /></label>
          <label className="field"><span className="flabel">Break min</span><input id="tm-break" className="num" type="number" min={1} max={60} value={brk} onChange={(e) => setBrk(e.target.value)} /></label>
        </div>
      )}
      <div className="btns">
        {timer.phase === 'idle' && <button className="btn primary" onClick={start}><Icon name="play" />Start focus</button>}
        {timer.phase === 'work' && <>
          <button className="btn" onClick={() => setTimer(timer.running ? { ...timer, accMs: timer.accMs + Date.now() - timer.resumedAt, running: false } : { ...timer, resumedAt: Date.now(), running: true })}>
            {timer.running ? <><Icon name="pause" />Pause</> : <><Icon name="play" />Resume</>}
          </button>
          <button className="btn primary" onClick={() => void endPhase(true)}>Finish and claim XP</button>
        </>}
        {timer.phase === 'break' && <button className="btn" onClick={() => setTimer({ ...timer, phase: 'done', running: false })}>Skip break</button>}
        {timer.phase === 'done' && <button className="btn primary" onClick={start}><Icon name="play" />Another round</button>}
        {timer.phase !== 'idle' && <button className="btn ghost" onClick={() => { const xp = timer.sessionXp; setTimer(null); close(); toast(xp ? `Session ended · +${xp} XP kept` : 'Session ended. No XP lost.'); }}>End session</button>}
      </div>
      <p className="hint">{timer.sessionXp ? <><b className="num">+{timer.sessionXp} XP</b> earned this sitting. </> : null}{ASCEND.focus.xpPerMinute} XP per focused minute, up to {ASCEND.focus.capPerSession} per session.</p>
    </div>
  );
}

