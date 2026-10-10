import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './viking.css';
import { supabase } from '@/lib/supabase';
import { setPortal } from '@/lib/portal';
import {
  CPS, EXBY, ORDER, PHASES, PHASE_KEYS, PLAN_ITEMS, PROTEIN, SESS, SUPPS, autoPhase,
  type PhaseKey, type SessionKey,
} from './vikingData';
import {
  best, defaultSettings, dn, fmtD, fmtDY, iso, k1, num, sum, thou, todayISO, viking,
  type Settings, type Viking, type VikingData,
} from './vikingLogic';
import { useVikingData, type SyncState } from './vikingDb';
import { Chart, dateTicks } from './Chart';

type Put = ReturnType<typeof useVikingData>['put'];
type Del = ReturnType<typeof useVikingData>['del'];
type Ctx = { v: Viking; data: VikingData; put: Put; del: Del; toast: (m: string) => void; T: string };

type Tab = 'today' | 'train' | 'body' | 'fuel' | 'ride';
const TABS: Array<[Tab, string]> = [['today', 'Today'], ['train', 'Train'], ['body', 'Body'], ['fuel', 'Fuel'], ['ride', 'Ride']];
const TAB_KEY = 'viking-tab';

function readTab(): Tab {
  try {
    const t = localStorage.getItem(TAB_KEY);
    if (TABS.some(([k]) => k === t)) return t as Tab;
  } catch { /* default */ }
  return 'today';
}

/** Local input text that follows the saved value until the user edits it. */
function useSynced(value: number | string | undefined | null) {
  const src = value === undefined || value === null ? '' : String(value);
  const [text, setText] = useState(src);
  const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setText(src); }, [src]);
  return {
    text,
    set: (s: string) => { dirty.current = true; setText(s); },
    clean: () => { dirty.current = false; },
    reset: (s: string) => { dirty.current = false; setText(s); },
  };
}

/** Delete button that needs a second tap within 3 s. */
function ConfirmButton({ onConfirm, className, label = 'Delete', confirmLabel = 'Confirm' }: {
  onConfirm: () => void; className: string; label?: string; confirmLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={`${className}${armed ? ' confirm' : ''}`}
      onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? confirmLabel : label}
    </button>
  );
}

const Tile = ({ lbl, v, u, sub }: { lbl: string; v: React.ReactNode; u: string; sub: React.ReactNode }) => (
  <div className="tile"><div className="label">{lbl}</div><div className="v">{v}<small>{u}</small></div><div className="s">{sub}</div></div>
);

// ═══════════════════════════════════════════════════════════════════════════
export function VikingApp({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const toast = (m: string) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  };
  const { data, loaded, sync, put, del } = useVikingData(userId, toast);
  const v = useMemo(() => viking(data), [data]);
  const [tab, setTab] = useState<Tab>(readTab);
  const [sheet, setSheet] = useState(false);
  const [T, setT] = useState(todayISO());
  const logger = useLogger(userId, v);

  useEffect(() => { setPortal('viking'); }, []);
  // Roll the day over at midnight and when the app comes back to the front.
  useEffect(() => {
    const tick = () => setT(todayISO());
    const id = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, []);

  function showTab(n: Tab) {
    setTab(n);
    try { localStorage.setItem(TAB_KEY, n); } catch { /* fine */ }
    window.scrollTo(0, 0);
  }

  const ctx: Ctx = { v, data, put, del, toast, T };
  const wk = v.weekOf(T), ph = v.phaseOf(T);

  return (
    <div className="vk">
      <header className="top"><div className="top-in">
        <div className="brand">Project <span>Viking</span></div>
        <span className="chip">Wk {wk} · {PHASES[ph].n}</span>
        <div className="spacer" />
        <SyncDot sync={sync} />
        <button type="button" className="icon-btn" aria-label="Plan settings" onClick={() => setSheet(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
        </button>
      </div></header>

      <main className="wrap">
        {sync === 'offline' && (
          <div className="banner">Can’t reach the server. You’re seeing the last saved copy; new entries may not save until you’re back online.</div>
        )}
        {tab === 'today' && <TodayTab ctx={ctx} loaded={loaded} onLog={() => { logger.pick(v.nextSession()); showTab('train'); }} />}
        {tab === 'train' && <TrainTab ctx={ctx} logger={logger} />}
        {tab === 'body' && <BodyTab ctx={ctx} />}
        {tab === 'fuel' && <FuelTab ctx={ctx} />}
        {tab === 'ride' && <RideTab ctx={ctx} />}
      </main>

      <nav className="tabs" aria-label="Sections"><div className="tabs-in" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => showTab(k)}>{l}</button>
        ))}
      </div></nav>

      {sheet && (
        <SettingsSheet ctx={ctx} onClose={() => setSheet(false)}
          onAscend={() => { setPortal('ascend'); navigate('/ascend'); }}
          onSignOut={() => { setPortal(null); void supabase.auth.signOut(); }} />
      )}
      {toastMsg && <div className="toast" role="status" aria-live="polite">{toastMsg}</div>}
    </div>
  );
}

function SyncDot({ sync }: { sync: SyncState }) {
  return (
    <div className="mode">
      <i className={`dot${sync === 'live' ? ' live' : sync === 'offline' ? ' off' : ''}`} />
      <span>{sync === 'live' ? 'Saved' : sync === 'offline' ? 'Offline' : 'Connecting'}</span>
    </div>
  );
}

// ── Today ───────────────────────────────────────────────────────────────────
function TodayTab({ ctx, loaded, onLog }: { ctx: Ctx; loaded: boolean; onLog: () => void }) {
  const { v, data, put, toast, T } = ctx;
  const t = dn(T), C = v.cfg, wk = v.weekOf(T), ph = v.phaseOf(T);
  const needsSetup = loaded && !data.settings;

  const [setupDate, setSetupDate] = useState(T);
  const [setupKg, setSetupKg] = useState('102');
  async function saveSetup() {
    const w = num(setupKg);
    if (!setupDate || !(w > 30)) { toast('Pick a start date and weight.'); return; }
    if (await put('settings', 'settings', { ...defaultSettings(T), startDate: setupDate, startWeight: w }))
      toast(`Week 1 starts ${fmtD(setupDate)}`);
  }

  // Next session
  const nx = v.nextSession();
  const W = v.sorted('workouts');
  const days = new Set(W.map((w) => w.date));
  const n7 = W.filter((w) => dn(w.date) > t - 7 && dn(w.date) <= t).length;
  let note = `${n7} of 4 sessions in the last 7 days.`;
  if (days.has(T)) note = 'Session logged today. ' + note;
  else if (days.has(iso(t - 1)) && days.has(iso(t - 2))) note = 'Lifted the last two days: take today off lifting (an easy ride is fine). ' + note;
  if (nx[0] === 'L' && v.sorted('rides').some((r) => r.type === 'hard' && (r.date === T || r.date === iso(t - 1))))
    note += ' Hard ride in the last 24 h: give your legs a day before this one.';

  // Tiles
  const a0 = v.avg7(t), a1 = v.avg7(t - 7);
  const ws = v.sorted('waist'), lw = ws[ws.length - 1], pw = ws[ws.length - 2];
  const pdays: number[] = [];
  for (let d = t - 6; d <= t; d++) { const n = v.nutTotals(iso(d)); if (n) pdays.push(n.p); }
  const dW = a0 && a1 ? a0 - a1 : null;

  const flags = v.coach(T);

  // Weigh-in + check-in
  const wi = useSynced(data.weights[T]?.kg);
  const rc = data.recovery[T] ?? { date: T };
  const sleep = useSynced(rc.sleep);
  const steps = useSynced(rc.steps);
  const rideToday = v.sorted('rides').some((r) => r.date === T);

  async function saveWeigh() {
    const w = num(wi.text);
    if (!(w > 30 && w < 300)) { toast('Enter your weight in kg, e.g. 101.4'); return; }
    if (await put('weights', T, { date: T, kg: w })) { wi.clean(); toast('Weigh-in saved'); }
  }
  async function saveCheckin() {
    const s = num(sleep.text), st = num(steps.text);
    if (!Number.isFinite(s) && !Number.isFinite(st)) { toast('Enter sleep hours or steps.'); return; }
    const doc = { ...rc, date: T };
    if (Number.isFinite(s)) doc.sleep = s;
    if (Number.isFinite(st)) doc.steps = Math.round(st);
    if (await put('recovery', T, doc)) { sleep.clean(); steps.clean(); toast('Check-in saved'); }
  }
  function toggleSupp(k: string) {
    const doc = { ...rc, date: T, supps: { ...(rc.supps ?? {}), [k]: !rc.supps?.[k] } };
    void put('recovery', T, doc);
  }
  async function adjust(by: number) {
    const next: Settings = { ...C, kcalAdjust: (num(C.kcalAdjust) || 0) + by, adjDate: T };
    if (await put('settings', 'settings', next)) toast(`Calorie target ${by > 0 ? 'raised' : 'lowered'} by ${Math.abs(by)} kcal`);
  }

  return (
    <section className="stack">
      {needsSetup && (
        <div className="card">
          <h2 style={{ fontSize: 24 }}>Start the year</h2>
          <p className="muted small" style={{ marginBlock: '4px 12px' }}>Set day one and your starting weight. Weeks, phases, deloads and checkpoints count from here.</p>
          <div className="row">
            <div className="field"><label htmlFor="setupDate">Start date</label><input id="setupDate" type="date" value={setupDate} onChange={(e) => setSetupDate(e.target.value)} /></div>
            <div className="field"><label htmlFor="setupKg">Start weight (kg)</label><input id="setupKg" inputMode="decimal" value={setupKg} onChange={(e) => setSetupKg(e.target.value)} /></div>
          </div>
          <button type="button" className="btn wide" style={{ marginTop: 12 }} onClick={() => void saveSetup()}>Start Project Viking</button>
        </div>
      )}

      <div className="card">
        <div className="weekline">
          <span className="big num">Week {wk} of 52</span>
          <span className="label">{PHASES[ph].n}{v.isDeloadWeek(wk) ? ' · Deload' : ''}{C.phaseMode !== 'auto' ? ' · set manually' : ''}</span>
        </div>
        <div className="strip" aria-label="52-week plan">
          {Array.from({ length: 52 }, (_, j) => {
            const i = j + 1, p = autoPhase(i);
            return (
              <div key={i} className={`wk${i < wk ? ' past' : ''}${i === wk ? ' now' : ''}${i % 6 === 0 ? ' dl' : ''}`}
                style={{ '--c': `var(${PHASES[p].c})` } as React.CSSProperties} title={`Week ${i}: ${PHASES[p].n}`} />
            );
          })}
        </div>
        <div className="legend">
          {PHASE_KEYS.map((k) => (
            <span key={k}><i style={{ '--c': `var(${PHASES[k].c})` } as React.CSSProperties} />{PHASES[k].n}</span>
          ))}
          <span className="muted">Dot = deload</span>
        </div>
      </div>

      <div className="card">
        <div className="label">Next session</div>
        <div className="next" style={{ marginTop: 4 }}>
          <div><div className="sess">{SESS[nx].n}</div><p className="muted small">{SESS[nx].sub}</p></div>
          <button type="button" className="btn" onClick={onLog}>Log it</button>
        </div>
        <p className="small" style={{ marginTop: 8 }}>{note}</p>
      </div>

      <div className="tiles">
        <Tile lbl="Weight 7-day" v={a0 ? k1(a0) : '—'} u="kg"
          sub={dW === null ? 'Needs 3+ weigh-ins a week' : <><span className={dW <= 0 ? 'down' : 'up'}>{dW <= 0 ? '−' : '+'}{k1(Math.abs(dW))} kg</span> vs last week</>} />
        <Tile lbl="Waist" v={lw ? k1(lw.cm) : '—'} u="cm"
          sub={lw ? (pw ? <><span className={lw.cm <= pw.cm ? 'down' : 'up'}>{lw.cm <= pw.cm ? '−' : '+'}{k1(Math.abs(lw.cm - pw.cm))}</span> since {fmtD(pw.date)}</> : `On ${fmtD(lw.date)}`) : 'Measure weekly'} />
        <Tile lbl="Sessions" v={n7} u="/ 4" sub="Last 7 days" />
        <Tile lbl="Protein" v={pdays.length ? Math.round(sum(pdays) / pdays.length) : '—'} u="g"
          sub={pdays.length ? `7-day average · goal ${PROTEIN}` : 'Log meals in Fuel'} />
      </div>

      <div className="card">
        <div className="card-head"><h2>Coach</h2><span className="label">From the plan's rules</span></div>
        <div className="flags">
          {needsSetup ? <p className="muted small">Set your start date above and the coach starts reading your log.</p>
            : flags.length ? flags.map((f, i) => (
              <div key={i} className="flag">
                <span className={`tag ${f.l}`}>{{ act: 'Act', warn: 'Watch', info: 'Note', good: 'Good' }[f.l]}</span>
                <b>{f.t}</b>
                <p>{f.b}</p>
                {f.adj && <button type="button" className="btn sm ghost" onClick={() => void adjust(f.adj!)}>{f.al}</button>}
              </div>
            )) : <p className="muted small">Nothing to flag. Keep logging.</p>}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Morning weigh-in</h2><span className="label num">{fmtD(T)}</span></div>
        <div className="row">
          <div className="field"><label htmlFor="wiKg">Weight (kg)</label><input id="wiKg" inputMode="decimal" placeholder="e.g. 101.4" value={wi.text} onChange={(e) => wi.set(e.target.value)} /></div>
          <button type="button" className="btn" onClick={() => void saveWeigh()}>Save</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Daily check-in</h2><span className="label">Recovery</span></div>
        <div className="row">
          <div className="field"><label htmlFor="ciSleep">Sleep (h)</label><input id="ciSleep" inputMode="decimal" placeholder="7.5" value={sleep.text} onChange={(e) => sleep.set(e.target.value)} /></div>
          <div className="field"><label htmlFor="ciSteps">Steps</label><input id="ciSteps" inputMode="numeric" placeholder="8000" value={steps.text} onChange={(e) => steps.set(e.target.value)} /></div>
          <button type="button" className="btn" onClick={() => void saveCheckin()}>Save</button>
        </div>
        <div className="label" style={{ marginBlock: '14px 8px' }}>Supplements taken</div>
        <div className="chips">
          {SUPPS.filter(([k]) => k !== 'electro' || rideToday).map(([k, n]) => (
            <button key={k} type="button" className="chipbtn" aria-pressed={!!rc.supps?.[k]} onClick={() => toggleSupp(k)}>{n}</button>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Train: logger state (drafts survive reloads, per user) ──────────────────
type Row = { kg: string; reps: string };
type Draft = { date: string; deload: boolean | null; rows: Record<string, Row[]>; added?: Record<string, number> };
type Drafts = Partial<Record<SessionKey, Draft>>;

function useLogger(uid: string, v: Viking) {
  const key = `viking_drafts_v1_${uid}`;
  const [drafts, setDrafts] = useState<Drafts>(() => {
    try { return (JSON.parse(localStorage.getItem(key) ?? '{}') as Drafts) ?? {}; } catch { return {}; }
  });
  const [picked, setPicked] = useState<SessionKey | null>(null);
  useEffect(() => {
    const id = setTimeout(() => { try { localStorage.setItem(key, JSON.stringify(drafts)); } catch { /* fine */ } }, 300);
    return () => clearTimeout(id);
  }, [drafts, key]);

  const sess = picked ?? v.nextSession();
  const draft: Draft = drafts[sess] ?? { date: todayISO(), deload: null, rows: {} };
  const wk = v.weekOf(draft.date), ph = v.phaseOf(draft.date);
  const deload = draft.deload ?? v.isDeloadWeek(wk);

  /** Every exercise's rows, sized to this week's prescription and pre-filled
   *  with the suggested weight. */
  function rowsFor(d: Draft, sk: SessionKey, dl: boolean, p: PhaseKey): Record<string, Row[]> {
    const out: Record<string, Row[]> = {};
    for (const ex of SESS[sk].ex) {
      const n = v.setCount(ex, sk, p, dl) + (d.added?.[ex.k] ?? 0);
      const hi = v.exHint(ex);
      const rows = (d.rows[ex.k] ?? []).map((r) => ({ ...r }));
      while (rows.length < n) rows.push({ kg: hi.kg === '' ? '' : String(hi.kg), reps: '' });
      while (rows.length > n && !rows[rows.length - 1].reps) rows.pop();
      out[ex.k] = rows;
    }
    return out;
  }
  const rows = rowsFor(draft, sess, deload, ph);

  function update(fn: (d: Draft) => Draft) {
    setDrafts((all) => ({ ...all, [sess]: fn({ ...draft, rows }) }));
  }

  return {
    sess, draft, rows, wk, ph, deload,
    pick: (s: SessionKey) => setPicked(s),
    setDate: (date: string) => update((d) => ({ ...d, date })),
    setDeload: (on: boolean) => update((d) => ({ ...d, deload: on })),
    setCell: (k: string, i: number, f: keyof Row, val: string) =>
      update((d) => ({ ...d, rows: { ...d.rows, [k]: d.rows[k].map((r, j) => (j === i ? { ...r, [f]: val } : r)) } })),
    addSet: (k: string) =>
      update((d) => {
        const list = d.rows[k] ?? [];
        return {
          ...d,
          rows: { ...d.rows, [k]: [...list, { kg: list.length ? list[list.length - 1].kg : '', reps: '' }] },
          added: { ...(d.added ?? {}), [k]: (d.added?.[k] ?? 0) + 1 },
        };
      }),
    /** Saved: drop this draft and move on to the next session in the rotation. */
    finish: (sk: SessionKey) => {
      setDrafts((all) => { const n = { ...all }; delete n[sk]; return n; });
      setPicked(ORDER[(ORDER.indexOf(sk) + 1) % 4]);
    },
    load: (sk: SessionKey, d: Draft) => { setDrafts((all) => ({ ...all, [sk]: d })); setPicked(sk); },
  };
}
type Logger = ReturnType<typeof useLogger>;

function TrainTab({ ctx, logger }: { ctx: Ctx; logger: Logger }) {
  const { v, put, del, toast } = ctx;
  const { sess, draft, rows, wk, ph, deload } = logger;
  const nx = v.nextSession();
  const extra: string[] = [];
  if (ph === '2' || ph === 'B' || ph === '3') extra.push('+1 set on laterals, rows and arms');
  if (ph === '4') extra.push('+1 set on upper-body work');
  const guide = `Week ${wk} · ${PHASES[ph].n}. `
    + (wk <= 4 ? 'Stay at 3 reps in reserve while you learn the lifts.' : 'Work at 2–3 reps in reserve; the last set of each exercise can go to 1.')
    + (extra.length ? ' Volume: ' + extra.join(', ') + '.' : '')
    + (deload ? ' Deload: half the sets, same weights.' : '')
    + ' Warm up 5 min on the bike, then 2–3 build-up sets on the first lift.';

  async function save() {
    const entries: Array<{ ex: string; sets: Array<{ kg: number; reps: number }> }> = [];
    for (const ex of SESS[sess].ex) {
      const sets = (rows[ex.k] ?? [])
        .filter((r) => num(r.reps) > 0)
        .map((r) => ({ kg: Number.isFinite(num(r.kg)) ? num(r.kg) : 0, reps: num(r.reps) }));
      if (sets.length) entries.push({ ex: ex.k, sets });
    }
    if (!entries.length) { toast('Enter reps for at least one set first.'); return; }
    const ok = await put('workouts', `${draft.date}_${sess}`, {
      date: draft.date, session: sess, week: wk, phase: ph, deload, entries, savedAt: Date.now(),
    });
    if (!ok) return;
    logger.finish(sess);
    window.scrollTo(0, 0);
    toast(`${SESS[sess].n} saved · ${sum(entries.map((e) => e.sets.length))} sets`);
  }

  // Lift progress
  const have = Object.keys(v.H).filter((k) => EXBY[k]);
  const opts = ORDER.flatMap((sk) => SESS[sk].ex.filter((e) => have.includes(e.k)).map((e) => e.k));
  const [liftSel, setLiftSel] = useState('');
  const cur = liftSel && opts.includes(liftSel) ? liftSel : opts.includes('bench') ? 'bench' : opts[0];

  const W = v.sorted('workouts').slice().reverse();

  return (
    <section className="stack">
      <div className="card">
        <div className="seg" role="group" aria-label="Session">
          {ORDER.map((k) => (
            <button key={k} type="button" aria-pressed={k === sess} onClick={() => logger.pick(k)}>
              {SESS[k].n}{k === nx && <span className="nx">Next</span>}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="field"><label htmlFor="lgDate">Date</label>
            <input id="lgDate" type="date" value={draft.date} onChange={(e) => e.target.value && logger.setDate(e.target.value)} /></div>
          <div className="field" style={{ flex: '0 1 150px' }}><span className="flabel">Deload</span>
            <div className="seg">
              <button type="button" aria-pressed={!deload} onClick={() => logger.setDeload(false)}>Off</button>
              <button type="button" aria-pressed={deload} onClick={() => logger.setDeload(true)}>On</button>
            </div>
          </div>
        </div>
        <p className="guide" style={{ marginTop: 12 }}>{guide}</p>
      </div>

      <div className="card">
        {SESS[sess].ex.map((ex) => {
          const list = rows[ex.k] ?? [];
          const hi = v.exHint(ex);
          const h = v.H[ex.k], last = h?.[h.length - 1];
          const unit = ex.u ?? 'reps';
          const range = ex.r[0] === ex.r[1] ? `${ex.r[0]}` : `${ex.r[0]}–${ex.r[1]}`;
          return (
            <div key={ex.k} className="ex">
              <div className="ex-head"><h3>{ex.n}</h3><span className="rx">{v.setCount(ex, sess, ph, deload)} × {range}{ex.u === 'm' ? ' m' : ''} · {ex.rest}</span></div>
              {ex.note && <p className="ex-note">{ex.note}</p>}
              <div className={`hint ${hi.c}`}>{hi.t}</div>
              {last && <div className="last">Last {fmtD(last.date)}: {last.sets.map((s) => `${s.kg}×${s.reps}`).join(' · ')}</div>}
              <div className="sets">
                <span className="hd">Set</span><span className="hd">kg</span><span className="hd">{unit}</span>
                {list.map((r, i) => (
                  <SetRow key={i} i={i} r={r} exName={ex.n} unit={unit} ph={`${ex.r[0]}–${ex.r[1]}`}
                    onChange={(f, val) => logger.setCell(ex.k, i, f, val)} />
                ))}
              </div>
              <button type="button" className="addset" onClick={() => logger.addSet(ex.k)}>+ Add set</button>
            </div>
          );
        })}
      </div>
      <div className="savebar"><button type="button" className="btn wide" onClick={() => void save()}>Save session</button></div>

      <div className="card">
        <div className="card-head"><h2>Lift progress</h2><span className="label">Est. 1-rep max</span></div>
        <div className="field" style={{ marginBottom: 10 }}>
          <label htmlFor="liftSel">Exercise</label>
          <select id="liftSel" disabled={!opts.length} value={cur ?? ''} onChange={(e) => setLiftSel(e.target.value)}>
            {opts.length ? opts.map((k) => <option key={k} value={k}>{EXBY[k].n}</option>) : <option value="">No lifts logged yet</option>}
          </select>
        </div>
        {cur ? <LiftChart v={v} k={cur} /> : <div className="empty">Log a session and each lift gets a strength line here. Strength going up while weight goes down means you are keeping muscle.</div>}
      </div>

      <div className="card">
        <div className="card-head"><h2>History</h2><span className="label">{W.length ? `${W.length} sessions` : ''}</span></div>
        {W.length ? W.slice(0, 15).map((x) => {
          const sets = sum((x.entries ?? []).map((e) => e.sets.length));
          const vol = sum((x.entries ?? []).flatMap((e) => e.sets.map((s) => Math.max(0, num(s.kg) || 0) * (num(s.reps) || 0))));
          return (
            <details key={x.id} className="wo">
              <summary>
                <span><b>{SESS[x.session]?.n ?? x.session}</b> <span className="muted">· {fmtD(x.date)}{x.deload ? ' · deload' : ''}</span></span>
                <span className="muted small">{sets} sets · {thou(vol)} kg</span>
              </summary>
              <div className="body">
                {(x.entries ?? []).map((e) => (
                  <div key={e.ex}>{EXBY[e.ex]?.n ?? e.ex}: {e.sets.map((s) => `${s.kg}×${s.reps}`).join(' · ')}</div>
                ))}
              </div>
              <div className="acts">
                <button type="button" className="btn sm ghost" onClick={() => {
                  const r: Record<string, Row[]> = {};
                  for (const e of x.entries ?? []) r[e.ex] = e.sets.map((s) => ({ kg: String(s.kg), reps: String(s.reps) }));
                  logger.load(x.session, { date: x.date, deload: !!x.deload, rows: r });
                  window.scrollTo(0, 0);
                  toast(`Editing ${SESS[x.session].n} from ${fmtD(x.date)}`);
                }}>Edit</button>
                <ConfirmButton className="btn sm danger" confirmLabel="Tap again to delete"
                  onConfirm={() => { void del('workouts', x.id); toast('Session deleted'); }} />
              </div>
            </details>
          );
        }) : <div className="empty">Saved sessions show up here with every set, and the logger uses them to suggest your next weights.</div>}
      </div>
    </section>
  );
}

function SetRow({ i, r, exName, unit, ph, onChange }: {
  i: number; r: Row; exName: string; unit: string; ph: string; onChange: (f: keyof Row, v: string) => void;
}) {
  return (
    <>
      <span className="n">{i + 1}</span>
      <input inputMode="decimal" value={r.kg} aria-label={`${exName} set ${i + 1} kg`} onChange={(e) => onChange('kg', e.target.value)} />
      <input inputMode="numeric" className={r.reps ? 'done' : ''} value={r.reps} placeholder={ph}
        aria-label={`${exName} set ${i + 1} ${unit}`} onChange={(e) => onChange('reps', e.target.value)} />
    </>
  );
}

function LiftChart({ v, k }: { v: Viking; k: string }) {
  const pts = v.H[k].map((x) => [dn(x.date), best(x.sets) ?? NaN] as [number, number]).filter((p) => Number.isFinite(p[1]));
  if (!pts.length) return <div className="empty">No sets logged for this lift yet.</div>;
  const ys = pts.map((p) => p[1]), x0 = pts[0][0], x1 = Math.max(pts[pts.length - 1][0], x0 + 7);
  const pad = Math.max(2, (Math.max(...ys) - Math.min(...ys)) * 0.15);
  return (
    <>
      <Chart x0={x0} x1={x1} y0={Math.min(...ys) - pad} y1={Math.max(...ys) + pad} xt={dateTicks(x0, x1)} aria="Estimated one-rep max over time"
        layers={[{ type: 'line', pts }, { type: 'dots', pts, cls: 'acc', r: 3 }, { type: 'end', pt: pts[pts.length - 1] }]} />
      <p className="muted small" style={{ marginTop: 6 }}>
        Best set per session, as kg × (1 + reps ÷ 30).{EXBY[k].inc === 'bw' || k === 'pullup' ? ' Bodyweight moves show reps instead.' : ''}
      </p>
    </>
  );
}

// ── Body ────────────────────────────────────────────────────────────────────
function BodyTab({ ctx }: { ctx: Ctx }) {
  const { v, put, del, toast, T } = ctx;
  const t = dn(T), W = v.sorted('weights');
  const [range, setRange] = useState(90);
  const [bwDate, setBwDate] = useState(T);
  const [bwKg, setBwKg] = useState('');
  const [wsDate, setWsDate] = useState(T);
  const [wsCm, setWsCm] = useState('');

  let weightChart: JSX.Element;
  if (!W.length) {
    weightChart = <div className="empty">Weigh in each morning and this fills with your daily weights, the 7-day average and the corridor to each checkpoint.</div>;
  } else {
    const first = dn(W[0].date), x0 = range ? Math.max(first, t - range + 1) : first, x1 = Math.max(t, x0 + 6);
    const pts = W.map((w) => [dn(w.date), w.kg] as [number, number]).filter((p) => p[0] >= x0 && p[0] <= x1);
    const avg: Array<[number, number]> = [];
    for (let d = x0; d <= x1; d++) { const a = v.avg7(d); if (a !== null && ctx.data.weights[iso(d)]) avg.push([d, a]); }
    const s = dn(v.cfg.startDate);
    const bx = [x0, ...CPS.map((c) => s + c.wk * 7).filter((d) => d > x0 && d < x1), x1].sort((a, b) => a - b);
    const band = bx.map((d) => { const b = v.bandAt(d); return [d, b.lo, b.hi] as [number, number, number]; });
    const ys = pts.map((p) => p[1]).concat(band.flatMap((b) => [b[1], b[2]]));
    weightChart = (
      <Chart x0={x0} x1={x1} y0={Math.floor(Math.min(...ys) - 1)} y1={Math.ceil(Math.max(...ys) + 1)} xt={dateTicks(x0, x1)} aria="Body weight"
        layers={[{ type: 'band', pts: band }, { type: 'dots', pts }, { type: 'line', pts: avg }, { type: 'end', pt: avg[avg.length - 1] }]} />
    );
  }

  const WS = v.sorted('waist');
  let waistChart: JSX.Element;
  if (!WS.length) waistChart = <div className="empty">One measurement a week builds this line. The waist is the tiebreaker when the scale stalls.</div>;
  else {
    const pts = WS.map((w) => [dn(w.date), w.cm] as [number, number]), ys = pts.map((p) => p[1]);
    const x0 = pts[0][0], x1 = Math.max(pts[pts.length - 1][0], x0 + 7);
    waistChart = (
      <Chart h={140} x0={x0} x1={x1} y0={Math.floor(Math.min(...ys) - 1)} y1={Math.ceil(Math.max(...ys) + 1)} xt={dateTicks(x0, x1, 3)} aria="Waist"
        layers={[{ type: 'line', pts }, { type: 'dots', pts, cls: 'acc', r: 3 }, { type: 'end', pt: pts[pts.length - 1] }]} />
    );
  }

  async function saveWeight() {
    const kg = num(bwKg);
    if (!bwDate || !(kg > 30 && kg < 300)) { toast('Pick a date and enter weight in kg.'); return; }
    if (await put('weights', bwDate, { date: bwDate, kg })) { setBwKg(''); toast(`Saved ${k1(kg)} kg for ${fmtD(bwDate)}`); }
  }
  async function saveWaist() {
    const cm = num(wsCm);
    if (!wsDate || !(cm > 40 && cm < 200)) { toast('Pick a date and enter your waist in cm.'); return; }
    if (await put('waist', wsDate, { date: wsDate, cm })) { setWsCm(''); toast('Waist saved'); }
  }

  const s = dn(v.cfg.startDate), cur = v.avg7(t);
  return (
    <section className="stack">
      <div className="card">
        <div className="card-head"><h2>Weight</h2>
          <div className="seg" style={{ minWidth: 180 }}>
            {[[30, '30 d'], [90, '90 d'], [0, 'All']].map(([val, l]) => (
              <button key={val} type="button" aria-pressed={range === val} onClick={() => setRange(val as number)}>{l}</button>
            ))}
          </div>
        </div>
        {weightChart}
        <div className="chart-key"><span><i />7-day average</span><span><i className="d" />Daily weigh-in</span><span><i className="b" />Checkpoint corridor</span></div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Log weight</h2></div>
        <div className="row">
          <div className="field"><label htmlFor="bwDate">Date</label><input id="bwDate" type="date" value={bwDate} onChange={(e) => setBwDate(e.target.value)} /></div>
          <div className="field"><label htmlFor="bwKg">Weight (kg)</label><input id="bwKg" inputMode="decimal" value={bwKg} onChange={(e) => setBwKg(e.target.value)} /></div>
          <button type="button" className="btn" onClick={() => void saveWeight()}>Save</button>
        </div>
        <div className="list" style={{ marginTop: 12 }}>
          {W.slice(-7).reverse().map((w) => (
            <div key={w.id} className="li"><span>{fmtD(w.date)}</span><span>{k1(w.kg)} kg</span>
              <ConfirmButton className="x" onConfirm={() => void del('weights', w.id)} /></div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Waist at the navel</h2><span className="label">Weekly, same morning</span></div>
        {waistChart}
        <div className="row" style={{ marginTop: 12 }}>
          <div className="field"><label htmlFor="wsDate">Date</label><input id="wsDate" type="date" value={wsDate} onChange={(e) => setWsDate(e.target.value)} /></div>
          <div className="field"><label htmlFor="wsCm">Waist (cm)</label><input id="wsCm" inputMode="decimal" value={wsCm} onChange={(e) => setWsCm(e.target.value)} /></div>
          <button type="button" className="btn" onClick={() => void saveWaist()}>Save</button>
        </div>
        <div className="list" style={{ marginTop: 12 }}>
          {WS.slice(-4).reverse().map((w) => (
            <div key={w.id} className="li"><span>{fmtD(w.date)}</span><span>{k1(w.cm)} cm</span>
              <ConfirmButton className="x" onConfirm={() => void del('waist', w.id)} /></div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Checkpoints</h2><span className="label">7-day average</span></div>
        <div className="tbl">
          <table>
            <thead><tr><th>Checkpoint</th><th>Target</th><th>You</th></tr></thead>
            <tbody>
              {CPS.map((c) => {
                const d = s + c.wk * 7;
                let you = '—';
                let st: JSX.Element | null = null;
                if (t >= d) {
                  const a = v.avg7(d);
                  if (a) {
                    you = `${k1(a)} kg`;
                    st = a <= c.hi
                      ? <span className="st good">{a >= c.lo ? 'On target' : 'Ahead'}</span>
                      : <span className="st warn">Above</span>;
                  }
                } else if (cur) {
                  const b = v.bandAt(t);
                  you = `${k1(cur)} kg now`;
                  st = (
                    <>
                      {cur > b.hi + 0.5 ? <span className="st warn">Behind pace</span>
                        : cur < b.lo - 0.5 ? <span className="st good">Ahead of pace</span>
                          : <span className="st good">On pace</span>}
                      {' '}<span className="muted small">{Math.ceil((d - t) / 7)} wk to go</span>
                    </>
                  );
                }
                return (
                  <tr key={c.wk}>
                    <td><b>{c.n}</b><br /><span className="muted small">{fmtDY(iso(d))}</span></td>
                    <td>{c.lo}–{c.hi} kg<br /><span className="muted small">{c.see}</span></td>
                    <td>{you}<br />{st}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ── Fuel ────────────────────────────────────────────────────────────────────
function FuelTab({ ctx }: { ctx: Ctx }) {
  const { v, data, put, toast, T } = ctx;
  const [day, setDay] = useState(T);
  const doc = data.nutrition[day] ?? { date: day };
  const tot = v.nutTotals(day) ?? { kcal: 0, p: 0, water: NaN };
  const tgt = v.kcalTarget(day), ph = v.phaseOf(day), adj = num(v.cfg.kcalAdjust) || 0;
  const fk = useSynced(doc.extraKcal);
  const fp = useSynced(doc.extraProtein);
  const fw = useSynced(doc.water);

  function changeDay(d: string) {
    if (!d) return;
    setDay(d);
    const n = data.nutrition[d];
    fk.reset(n?.extraKcal != null ? String(n.extraKcal) : '');
    fp.reset(n?.extraProtein != null ? String(n.extraProtein) : '');
    fw.reset(n?.water != null ? String(n.water) : '');
  }
  function toggle(k: string) {
    void put('nutrition', day, { ...doc, date: day, items: { ...(doc.items ?? {}), [k]: !doc.items?.[k] } });
  }
  async function saveExtras() {
    const k = num(fk.text), p = num(fp.text), w = num(fw.text);
    const next = { ...doc, date: day, extraKcal: Number.isFinite(k) ? k : 0, extraProtein: Number.isFinite(p) ? p : 0 };
    if (Number.isFinite(w)) next.water = w; else delete next.water;
    if (await put('nutrition', day, next)) { fk.clean(); fp.clean(); fw.clean(); toast('Extras saved'); }
  }

  const Meter = ({ lbl, val, goal, unit, sub }: { lbl: string; val: number; goal: number; unit: string; sub: string }) => {
    const pct = Math.min(100, goal ? (val / goal) * 100 : 0);
    return (
      <div className="meter">
        <div className="top-line"><span className="label">{lbl}</span><span><b>{thou(val)}</b> / {thou(goal)} {unit}</span></div>
        <div className={`bar${val > goal * 1.05 ? ' over' : ''}`}><i style={{ width: `${pct.toFixed(1)}%` }} /></div>
        <span className="muted small">{sub}</span>
      </div>
    );
  };

  // Last 14 days
  const t = dn(T), x0 = t - 13;
  const kc: Array<[number, number, string]> = [], pr: Array<[number, number, string]> = [];
  for (let d = x0; d <= t; d++) {
    const n = v.nutTotals(iso(d));
    if (n) { kc.push([d, n.kcal, n.kcal < 1800 ? 'lo' : '']); pr.push([d, n.p, n.p < PROTEIN - 15 ? 'lo' : '']); }
  }
  const tgNow = v.kcalTarget(T);

  return (
    <section className="stack">
      <div className="card">
        <div className="row" style={{ alignItems: 'center' }}>
          <div className="field"><label htmlFor="fuDate">Day</label><input id="fuDate" type="date" value={day} onChange={(e) => changeDay(e.target.value)} /></div>
        </div>
        <div className="stack" style={{ gap: 12, marginTop: 14 }}>
          <Meter lbl="Calories" val={tot.kcal} goal={tgt} unit="kcal"
            sub={`${PHASES[ph].n} ${thou(PHASES[ph].kcal)}${adj ? ` ${adj > 0 ? '+' : '−'} ${Math.abs(adj)} adjustment` : ''}${v.longRide(day) ? ' + 300 long ride' : ''}`} />
          <Meter lbl="Protein" val={tot.p} goal={PROTEIN} unit="g" sub="The non-negotiable" />
          <Meter lbl="Water" val={Number.isFinite(tot.water) ? tot.water : 0} goal={3.5} unit="L" sub="3–4 L, more on ride days" />
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>The plan's day</h2><span className="label">Tap what you ate</span></div>
        <div className="items">
          {PLAN_ITEMS.map((it) => (
            <button key={it.k} type="button" className="item" aria-pressed={!!doc.items?.[it.k]} onClick={() => toggle(it.k)}>
              <span className="box"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg></span>
              <span><b>{it.n}</b><br /><span className="muted small">{it.sub}</span></span>
              <span className="m">{it.kcal} kcal<br />{it.p} g</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Extras</h2><span className="label">Anything off-plan</span></div>
        <div className="row">
          <div className="field"><label htmlFor="fuK">kcal</label><input id="fuK" inputMode="numeric" placeholder="0" value={fk.text} onChange={(e) => fk.set(e.target.value)} /></div>
          <div className="field"><label htmlFor="fuP">Protein (g)</label><input id="fuP" inputMode="numeric" placeholder="0" value={fp.text} onChange={(e) => fp.set(e.target.value)} /></div>
          <div className="field"><label htmlFor="fuW">Water (L)</label><input id="fuW" inputMode="decimal" placeholder="3.5" value={fw.text} onChange={(e) => fw.set(e.target.value)} /></div>
        </div>
        <button type="button" className="btn wide" style={{ marginTop: 12 }} onClick={() => void saveExtras()}>Save extras</button>
      </div>

      <div className="card">
        <div className="card-head"><h2>Last 14 days</h2><span className="label">Calories</span></div>
        {kc.length ? (
          <>
            <Chart h={140} x0={x0 - 0.6} x1={t + 0.6} y0={0} y1={Math.max(tgNow, ...kc.map((p) => p[1])) * 1.1} xt={dateTicks(x0, t, 3)} aria="Calories per day"
              layers={[{ type: 'bars', pts: kc }, { type: 'hline', y: tgNow, label: `${thou(tgNow)} target` }]} />
            <div className="card-head" style={{ marginTop: 14 }}><span /><span className="label">Protein (g)</span></div>
            <Chart h={140} x0={x0 - 0.6} x1={t + 0.6} y0={0} y1={Math.max(PROTEIN, ...pr.map((p) => p[1])) * 1.1} xt={dateTicks(x0, t, 3)} aria="Protein per day"
              layers={[{ type: 'bars', pts: pr }, { type: 'hline', y: PROTEIN, label: `${PROTEIN} g` }]} />
          </>
        ) : <div className="empty">Tick off meals above and the last two weeks of calories and protein build here.</div>}
      </div>
    </section>
  );
}

// ── Ride ────────────────────────────────────────────────────────────────────
function RideTab({ ctx }: { ctx: Ctx }) {
  const { v, data, put, del, toast, T } = ctx;
  const t = dn(T), R = v.sorted('rides'), r7 = R.filter((r) => dn(r.date) > t - 7 && dn(r.date) <= t);
  const hard = r7.filter((r) => r.type === 'hard').length, mins = sum(r7.map((r) => r.minutes || 0));
  const sl: number[] = [];
  for (let d = t - 6; d <= t; d++) { const r = data.recovery[iso(d)]; if (r && Number.isFinite(num(r.sleep))) sl.push(num(r.sleep)); }
  const P = PHASES[v.phaseOf(T)];
  const [type, setType] = useState<'easy' | 'hard'>('easy');
  const [date, setDate] = useState(T);
  const [min, setMin] = useState('');
  const [hr, setHr] = useState('');

  async function save() {
    const m = num(min), h = num(hr);
    if (!date || !(m > 0)) { toast('Pick a date and enter the ride length in minutes.'); return; }
    const kind = m > 90 ? 'hard' : type;
    const doc: { date: string; type: 'easy' | 'hard'; minutes: number; hr?: number; savedAt: number } =
      { date, type: kind, minutes: Math.round(m), savedAt: Date.now() };
    if (Number.isFinite(h)) doc.hr = Math.round(h);
    if (await put('rides', `${date}_${Date.now().toString(36)}`, doc)) {
      setMin(''); setHr('');
      toast(kind === 'hard' && type === 'easy' ? 'Saved as hard: rides over 90 min count as hard' : 'Ride saved');
    }
  }

  const x0 = t - 13, sp: Array<[number, number, string]> = [], stp: Array<[number, number, string]> = [];
  for (let d = x0; d <= t; d++) {
    const r = data.recovery[iso(d)];
    if (r && Number.isFinite(num(r.sleep))) sp.push([d, num(r.sleep), num(r.sleep) < 7 ? 'lo' : '']);
    if (r && Number.isFinite(num(r.steps))) stp.push([d, num(r.steps), num(r.steps) < 7000 ? 'lo' : '']);
  }

  return (
    <section className="stack">
      <div className="tiles">
        <Tile lbl="Rides" v={r7.length} u="" sub="Last 7 days" />
        <Tile lbl="Hard" v={hard} u={P.cut ? '/ 2' : ''} sub={P.cut ? (hard > 2 ? <span className="up">Over the cut limit</span> : 'Cap during the cut') : 'Last 7 days'} />
        <Tile lbl="Ride time" v={Math.round(mins / 6) / 10} u="h" sub="Last 7 days" />
        <Tile lbl="Sleep" v={sl.length ? k1(sum(sl) / sl.length) : '—'} u="h" sub={sl.length ? '7-day average' : 'Log in Today'} />
      </div>

      <div className="card">
        <div className="card-head"><h2>Log a ride</h2></div>
        <div className="seg" role="group" aria-label="Ride type">
          <button type="button" aria-pressed={type === 'easy'} onClick={() => setType('easy')}>Easy · Zone 2</button>
          <button type="button" aria-pressed={type === 'hard'} onClick={() => setType('hard')}>Hard</button>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="field"><label htmlFor="rdDate">Date</label><input id="rdDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label htmlFor="rdMin">Minutes</label><input id="rdMin" inputMode="numeric" placeholder="60" value={min} onChange={(e) => setMin(e.target.value)} /></div>
          <div className="field"><label htmlFor="rdHr">Avg HR</label><input id="rdHr" inputMode="numeric" placeholder="125" value={hr} onChange={(e) => setHr(e.target.value)} /></div>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>Hard = climbs, intervals, fast trail, or over 90 min. Rides of 90 min or more add 300 kcal to that day's target.</p>
        <button type="button" className="btn wide" style={{ marginTop: 12 }} onClick={() => void save()}>Save ride</button>
        <div className="list" style={{ marginTop: 12 }}>
          {R.length ? R.slice(-6).reverse().map((r) => (
            <div key={r.id} className="li">
              <span>{fmtD(r.date)} · <span className={`st ${r.type === 'hard' ? 'warn' : 'info'}`}>{r.type}</span></span>
              <span>{r.minutes} min{r.hr ? ` · ${r.hr} bpm` : ''}</span>
              <ConfirmButton className="x" onConfirm={() => void del('rides', r.id)} />
            </div>
          )) : <p className="muted small">No rides yet.</p>}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Sleep</h2><span className="label">Target 7–9 h</span></div>
        {sp.length ? (
          <Chart h={130} x0={x0 - 0.6} x1={t + 0.6} y0={0} y1={Math.max(9.5, ...sp.map((p) => p[1]))} xt={dateTicks(x0, t, 3)} aria="Sleep hours"
            layers={[{ type: 'bars', pts: sp }, { type: 'hline', y: 7, label: '7 h' }]} />
        ) : <div className="empty">Log sleep in the daily check-in on Today.</div>}
        <div className="card-head" style={{ marginTop: 14 }}><h2>Steps</h2><span className="label">7,000–10,000 on non-ride days</span></div>
        {stp.length ? (
          <Chart h={130} x0={x0 - 0.6} x1={t + 0.6} y0={0} y1={Math.max(10000, ...stp.map((p) => p[1])) * 1.08} xt={dateTicks(x0, t, 3)}
            yFmt={(n) => (n >= 1000 ? `${n / 1000}k` : String(n))} aria="Steps"
            layers={[{ type: 'bars', pts: stp }, { type: 'hline', y: 7000, label: '7,000' }]} />
        ) : <div className="empty">Steps from the daily check-in land here. The Garmin shows them each evening.</div>}
      </div>
    </section>
  );
}

// ── Settings sheet ──────────────────────────────────────────────────────────
function SettingsSheet({ ctx, onClose, onAscend, onSignOut }: {
  ctx: Ctx; onClose: () => void; onAscend: () => void; onSignOut: () => void;
}) {
  const { v, put, toast, T } = ctx;
  const C = v.cfg;
  const [date, setDate] = useState(C.startDate);
  const [kg, setKg] = useState(String(C.startWeight));
  const [phase, setPhase] = useState<Settings['phaseMode']>(C.phaseMode || 'auto');
  const [adj, setAdj] = useState(String(C.kcalAdjust || 0));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    const w = num(kg), a = num(adj);
    const next: Settings = {
      ...C,
      startDate: date || C.startDate,
      startWeight: Number.isFinite(w) ? w : C.startWeight,
      phaseMode: phase,
      kcalAdjust: Number.isFinite(a) ? Math.round(a) : 0,
    };
    if (next.kcalAdjust !== (num(C.kcalAdjust) || 0)) next.adjDate = T;
    if (await put('settings', 'settings', next)) { onClose(); toast('Settings saved'); }
  }

  return (
    <div className="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="vkSetTitle">
        <h2 id="vkSetTitle" style={{ fontSize: 24, marginBottom: 12 }}>Plan settings</h2>
        <div className="stack" style={{ gap: 12 }}>
          <div className="row">
            <div className="field"><label htmlFor="stDate">Start date</label><input id="stDate" type="date" autoFocus value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="field"><label htmlFor="stKg">Start weight (kg)</label><input id="stKg" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} /></div>
          </div>
          <div className="field"><label htmlFor="stPhase">Phase</label>
            <select id="stPhase" value={phase} onChange={(e) => setPhase(e.target.value as Settings['phaseMode'])}>
              <option value="auto">Follow the calendar</option>
              <option value="1">1 · Foundation cut</option>
              <option value="2">2 · Main cut</option>
              <option value="B">Diet break</option>
              <option value="3">3 · Finish cut</option>
              <option value="4">4 · Lean build</option>
            </select>
            <p className="muted small">The plan says to move phases by results, not the calendar. Pick a phase here to hold or advance it.</p>
          </div>
          <div className="field"><label htmlFor="stAdj">Calorie adjustment (kcal)</label>
            <input id="stAdj" inputMode="numeric" value={adj} onChange={(e) => setAdj(e.target.value)} />
            <p className="muted small">Added to every phase target. The coach's "Add 200" and "Cut 150" buttons change this.</p>
          </div>
          <div className="row">
            <button type="button" className="btn ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={() => void save()}>Save</button>
          </div>
          <hr />
          <div className="row">
            <button type="button" className="btn ghost" style={{ flex: 1 }} onClick={onAscend}>Switch to Ascend</button>
            <button type="button" className="btn danger" style={{ flex: 1 }} onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </div>
    </div>
  );
}
