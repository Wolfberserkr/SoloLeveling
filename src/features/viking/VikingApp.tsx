import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  CPS, EXBY, ORDER, PHASES, PHASE_KEYS, PLAN_ITEMS, PROTEIN, SESS, autoPhase,
} from './vikingData';
import {
  best, defaultSettings, dn, fmtD, fmtDY, iso, k1, num, sum, thou, todayISO, viking,
  type BenchDoc, type Flag, type Settings, type Viking, type VikingData,
} from './vikingLogic';
import { useVikingData, type SyncState } from './vikingDb';
import { Chart, dateTicks } from './Chart';
import { nextOnWatch, nextPlanState, type PlanState } from './watchCard';
import {
  AVOID_WINDOW, BENCHMARKS, BIKE_PHASES, HARD_WINDOW_DAYS, RIDES, SHIFTS, ZONES,
  type BenchId,
} from './bikePlan';
import { bike, mmss, parseTime, zoneLabel, type Bike, type Rx } from './bikeLogic';

type Put = ReturnType<typeof useVikingData>['put'];
type Del = ReturnType<typeof useVikingData>['del'];
type Ctx = { v: Viking; b: Bike; data: VikingData; put: Put; del: Del; toast: (m: string) => void; T: string };

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
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const toast = (m: string) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  };
  const { data, loaded, sync, put, del } = useVikingData(userId, toast);
  const v = useMemo(() => viking(data), [data]);
  const b = useMemo(() => bike(v), [v]);
  const [tab, setTab] = useState<Tab>(readTab);
  const [sheet, setSheet] = useState(false);
  const [T, setT] = useState(todayISO());
  const plan = usePlan(userId);

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

  const ctx: Ctx = { v, b, data, put, del, toast, T };
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
          <div className="banner">Can’t reach the server. You’re seeing the last saved copy.</div>
        )}
        {tab === 'today' && <TodayTab ctx={ctx} loaded={loaded} plan={plan} />}
        {tab === 'train' && <TrainTab ctx={ctx} />}
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
        <SettingsSheet ctx={ctx} onClose={() => setSheet(false)} onSignOut={() => { void supabase.auth.signOut(); }} />
      )}
      {toastMsg && <div className="toast" role="status" aria-live="polite">{toastMsg}</div>}
    </div>
  );
}

/** Jarvis's plan (`plan/current`), reloaded when the app comes back to the front or back online (see PlanState). */
function usePlan(uid: string): PlanState {
  const [plan, setPlan] = useState<PlanState>(undefined);
  useEffect(() => {
    let live = true;
    const load = async () => {
      let res: { data: unknown; error: unknown };
      try {
        res = await supabase.from('viking_docs').select('data')
          .eq('user_id', uid).eq('coll', 'plan').eq('doc_id', 'current').maybeSingle();
      } catch (error) {
        res = { data: null, error };
      }
      if (live) setPlan((prev) => nextPlanState(prev, res));
    };
    void load();
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    const onOnline = () => { void load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [uid]);
  return plan;
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
function TodayTab({ ctx, loaded, plan }: { ctx: Ctx; loaded: boolean; plan: PlanState }) {
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

  // Sessions so far (the plan itself, spacing included, comes from Jarvis)
  const W = v.sorted('workouts');
  const n7 = W.filter((w) => dn(w.date) > t - 7 && dn(w.date) <= t).length;
  const note = `${W.some((w) => w.date === T) ? 'Session recorded today. ' : ''}${n7} of 4 sessions in the last 7 days.`;

  // Tiles
  const a0 = v.avg7(t), a1 = v.avg7(t - 7);
  const ws = v.sorted('waist'), lw = ws[ws.length - 1], pw = ws[ws.length - 2];
  const pdays: number[] = [];
  for (let d = t - 6; d <= t; d++) { const n = v.nutTotals(iso(d)); if (n) pdays.push(n.p); }
  const dW = a0 && a1 ? a0 - a1 : null;

  const flags = v.coach(T, { garmin: true });

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

      <WatchCard plan={plan} T={T} note={note} />

      {!needsSetup && <CycleCard ctx={ctx} />}

      <div className="tiles">
        <Tile lbl="Weight 7-day" v={a0 ? k1(a0) : '—'} u="kg"
          sub={dW === null ? 'Needs 3+ weigh-ins a week' : <><span className={dW <= 0 ? 'down' : 'up'}>{dW <= 0 ? '−' : '+'}{k1(Math.abs(dW))} kg</span> vs last week</>} />
        <Tile lbl="Waist" v={lw ? k1(lw.cm) : '—'} u="cm"
          sub={lw ? (pw ? <><span className={lw.cm <= pw.cm ? 'down' : 'up'}>{lw.cm <= pw.cm ? '−' : '+'}{k1(Math.abs(lw.cm - pw.cm))}</span> since {fmtD(pw.date)}</> : `On ${fmtD(lw.date)}`) : 'No measurement yet'} />
        <Tile lbl="Sessions" v={n7} u="/ 4" sub="Last 7 days" />
        <Tile lbl="Protein" v={pdays.length ? Math.round(sum(pdays) / pdays.length) : '—'} u="g"
          sub={pdays.length ? `7-day average · goal ${PROTEIN}` : 'No meals logged'} />
      </div>

      <div className="card">
        <div className="card-head"><h2>Coach</h2><span className="label">From the plan's rules</span></div>
        <div className="flags">
          {needsSetup ? <p className="muted small">Set your start date above and the coach starts reading your data.</p>
            : flags.length ? flags.map((f, i) => (
              <div key={i} className="flag">
                <span className={`tag ${f.l}`}>{{ act: 'Act', warn: 'Watch', info: 'Note', good: 'Good' }[f.l]}</span>
                <b>{f.t}</b>
                <p>{f.b}</p>
              </div>
            )) : <p className="muted small">Nothing to flag.</p>}
        </div>
      </div>

    </section>
  );
}

/** "Next on your watch": the first training day in Jarvis's plan, with its top targets. */
function WatchCard({ plan, T, note }: { plan: PlanState; T: string; note: string }) {
  const c = plan === undefined ? null : nextOnWatch(plan, T);
  const when = (d: string) => (d === T ? 'Today' : d === iso(dn(T) + 1) ? 'Tomorrow' : fmtD(d));
  return (
    <div className="card watch">
      <div className="card-head"><div className="label">Next on your watch</div>{c && 'date' in c && <span className="label num">{when(c.date)}</span>}</div>
      {c === null ? <p className="muted small">Checking Jarvis’s plan…</p>
        : 'none' in c ? <p className="muted small">{{ 'no-plan': 'Jarvis hasn’t built a plan yet.', rest: 'Only rest days are planned for now.', offline: 'Can’t reach the server to load Jarvis’s plan. It loads when you’re back online.' }[c.none]}</p>
          : (
            <>
              <div className="sess">{c.title}</div>
              <p className="muted small">{c.sub}</p>
              {c.rows.length > 0 && (
                <div className="list">
                  {c.rows.map((r) => <div key={r.name} className="li"><span>{r.name}</span><span>{r.rx}</span></div>)}
                </div>
              )}
              {c.reason && <p className="small swap">{c.reason}</p>}
            </>
          )}
      <p className="small" style={{ marginTop: 8 }}>{note}</p>
    </div>
  );
}

// ── Train: progress and history (sessions come from the watch) ──────────────
function TrainTab({ ctx }: { ctx: Ctx }) {
  const { v } = ctx;
  // Lift progress
  const have = Object.keys(v.H).filter((k) => EXBY[k]);
  const opts = ORDER.flatMap((sk) => SESS[sk].ex.filter((e) => have.includes(e.k)).map((e) => e.k));
  const [liftSel, setLiftSel] = useState('');
  const cur = liftSel && opts.includes(liftSel) ? liftSel : opts.includes('bench') ? 'bench' : opts[0];

  const W = v.sorted('workouts').slice().reverse();

  return (
    <section className="stack">
      <div className="card">
        <div className="card-head"><h2>Lift progress</h2><span className="label">Est. 1-rep max</span></div>
        <div className="field" style={{ marginBottom: 10 }}>
          <label htmlFor="liftSel">Exercise</label>
          <select id="liftSel" disabled={!opts.length} value={cur ?? ''} onChange={(e) => setLiftSel(e.target.value)}>
            {opts.length ? opts.map((k) => <option key={k} value={k}>{EXBY[k].n}</option>) : <option value="">No lifts recorded yet</option>}
          </select>
        </div>
        {cur ? <LiftChart v={v} k={cur} /> : <div className="empty">Each session from the watch adds to a strength line here. Strength going up while weight goes down means you are keeping muscle.</div>}
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
            </details>
          );
        }) : <div className="empty">Sessions you record on the watch show up here with every set, after Jarvis imports them.</div>}
        <p className="muted small" style={{ marginTop: 10 }}>To fix a session, tell Jarvis on Telegram what you actually did.</p>
      </div>
    </section>
  );
}

function LiftChart({ v, k }: { v: Viking; k: string }) {
  const pts = v.H[k].map((x) => [dn(x.date), best(x.sets) ?? NaN] as [number, number]).filter((p) => Number.isFinite(p[1]));
  if (!pts.length) return <div className="empty">No sets recorded for this lift yet.</div>;
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
  const { v, T } = ctx;
  const t = dn(T), W = v.sorted('weights');
  const [range, setRange] = useState(90);

  let weightChart: JSX.Element;
  if (!W.length) {
    weightChart = <div className="empty">Weigh-ins from Garmin fill this with your daily weights, the 7-day average and the corridor to each checkpoint.</div>;
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
  if (!WS.length) waistChart = <div className="empty">No waist measurements yet. The waist is the tiebreaker when the scale stalls.</div>;
  else {
    const pts = WS.map((w) => [dn(w.date), w.cm] as [number, number]), ys = pts.map((p) => p[1]);
    const x0 = pts[0][0], x1 = Math.max(pts[pts.length - 1][0], x0 + 7);
    waistChart = (
      <Chart h={140} x0={x0} x1={x1} y0={Math.floor(Math.min(...ys) - 1)} y1={Math.ceil(Math.max(...ys) + 1)} xt={dateTicks(x0, x1, 3)} aria="Waist"
        layers={[{ type: 'line', pts }, { type: 'dots', pts, cls: 'acc', r: 3 }, { type: 'end', pt: pts[pts.length - 1] }]} />
    );
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
        <div className="card-head"><h2>Recent weigh-ins</h2><span className="label">From Garmin</span></div>
        <div className="list">
          {W.length ? W.slice(-7).reverse().map((w) => (
            <div key={w.id} className="li"><span>{fmtD(w.date)}</span><span>{k1(w.kg)} kg</span></div>
          )) : <p className="muted small">No weigh-ins yet.</p>}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Waist at the navel</h2><span className="label">Weekly, same morning</span></div>
        {waistChart}
        <div className="list" style={{ marginTop: 12 }}>
          {WS.slice(-4).reverse().map((w) => (
            <div key={w.id} className="li"><span>{fmtD(w.date)}</span><span>{k1(w.cm)} cm</span></div>
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
  const { v, data, T } = ctx;
  const [day, setDay] = useState(T);
  const doc = data.nutrition[day] ?? { date: day };
  const tot = v.nutTotals(day) ?? { kcal: 0, p: 0, water: NaN };
  const tgt = v.kcalTarget(day), ph = v.phaseOf(day), adj = num(v.cfg.kcalAdjust) || 0;
  const step = (by: number) => { const d = iso(dn(day) + by); if (d <= T) setDay(d); };
  const extras = [
    num(doc.extraKcal) > 0 && `${thou(num(doc.extraKcal))} kcal`,
    num(doc.extraProtein) > 0 && `${Math.round(num(doc.extraProtein))} g protein`,
  ].filter(Boolean).join(' · ');

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
        <div className="card-head">
          <button type="button" className="btn sm ghost" aria-label="Previous day" onClick={() => step(-1)}>‹</button>
          <span className="label num">{day === T ? 'Today' : fmtD(day)}</span>
          <button type="button" className="btn sm ghost" aria-label="Next day" disabled={day >= T} onClick={() => step(1)}>›</button>
        </div>
        <div className="stack" style={{ gap: 12, marginTop: 14 }}>
          <Meter lbl="Calories" val={tot.kcal} goal={tgt} unit="kcal"
            sub={`${PHASES[ph].n} ${thou(PHASES[ph].kcal)}${adj ? ` ${adj > 0 ? '+' : '−'} ${Math.abs(adj)} adjustment` : ''}${v.longRide(day) ? ' + 300 long ride' : ''}`} />
          <Meter lbl="Protein" val={tot.p} goal={PROTEIN} unit="g" sub="The non-negotiable" />
          <Meter lbl="Water" val={Number.isFinite(tot.water) ? tot.water : 0} goal={3.5} unit="L" sub="3–4 L, more on ride days" />
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>The plan's day</h2><span className="label">Ticked = eaten</span></div>
        <div className="items">
          {PLAN_ITEMS.map((it) => (
            <div key={it.k} className="item" data-on={doc.items?.[it.k] ? '' : undefined}>
              <span className="box"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg></span>
              <span><b>{it.n}</b><br /><span className="muted small">{it.sub}</span></span>
              <span className="m">{it.kcal} kcal<br />{it.p} g</span>
            </div>
          ))}
        </div>
        {extras && <p className="small muted" style={{ marginTop: 10 }}>Extras: {extras}</p>}
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
        ) : <div className="empty">No meals logged in the last two weeks.</div>}
      </div>
    </section>
  );
}

// ── Bike plan: the 8-day cycle ──────────────────────────────────────────────
function FlagList({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null;
  return (
    <div className="flags" style={{ marginTop: 10 }}>
      {flags.map((f, i) => (
        <div key={i} className="flag">
          <span className={`tag ${f.l}`}>{{ act: 'Act', warn: 'Watch', info: 'Note', good: 'Good' }[f.l]}</span>
          <b>{f.t}</b>
          <p>{f.b}</p>
        </div>
      ))}
    </div>
  );
}

function RideCard({ rx }: { rx: Rx }) {
  const R = RIDES[rx.code];
  const dur = rx.min[0] === rx.min[1] ? `${rx.min[0]} min` : `${rx.min[0]}–${rx.min[1]} min`;
  return (
    <div className="ride">
      <div className="ride-head">
        <span className={`code${R.hard ? ' hard' : ''}`}>{rx.code}</span>
        <h3>{R.n}</h3>
        <span className="rx">{dur}</span>
      </div>
      {rx.from && <p className="small" style={{ color: 'var(--warn)' }}>Replaces {rx.from} {RIDES[rx.from].n} this deload week.</p>}
      <p className="small"><b>{zoneLabel(rx.zones)}</b></p>
      <p className="small muted">{rx.detail}</p>
      <p className="small muted">Where: {R.where}</p>
    </div>
  );
}

const BOX_NAMES = ['UA', 'LA', 'Ride', 'UB', 'LB', 'E1', 'Ride', 'Rest'];

function CycleCard({ ctx }: { ctx: Ctx }) {
  const { v, b, T } = ctx;
  const boxes = b.lap().boxes;
  const cur = b.current().day;
  const P = b.today(T);
  const last = v.sorted('cycle').slice(-1)[0];
  const due = b.retestDue(T);
  const flags = [...P.flags];
  if (due) flags.push({ l: 'info', t: 'Benchmark retest', b: `Deload week ${due.wk} is ending: ride the aerobic and climb test segments and log them under Ride → Benchmarks.` });

  return (
    <div className="card">
      <div className="card-head">
        <div className="label">Cycle · day {P.day} of 8</div>
        <span className="label">{BIKE_PHASES[P.ph].n}{P.deload && <span className="st warn" style={{ marginLeft: 6 }}>Deload</span>}</span>
      </div>
      <div className="lap" role="list" aria-label="This lap">
        {boxes.map((x) => (
          <div key={x.day} role="listitem" className={`lb ${x.status}${x.day === cur ? ' cur' : ''}`}
            aria-label={`Day ${x.day} ${BOX_NAMES[x.day - 1]}: ${x.status === 'done' ? 'done' : x.status === 'open' ? 'open' : 'skipped'}${x.day === cur ? ', next' : ''}`}>
            <span className="mark" aria-hidden="true">{x.status === 'done' ? '✓' : x.status === 'open' ? '○' : '–'}</span>
            <span className="nm">{BOX_NAMES[x.day - 1]}</span>
          </div>
        ))}
      </div>
      <div className="next">
        <div>
          <div className="sess" style={{ fontSize: 30 }}>
            {P.cd.gym ? SESS[P.cd.gym].n : P.rx.length ? (P.rx.length > 1 ? 'Ride' : RIDES[P.rx[0].code].n) : 'Rest'}
          </div>
          <p className="muted small">
            {P.cd.gym ? (P.rx.length ? `Gym day${P.optional ? ' · optional ride' : ' + ride'}` : 'Gym day · no ride')
              : P.rx.length ? (P.optional ? 'Optional ride' : P.cd.note ?? 'Ride day') : P.cd.note ?? 'Full rest'}
          </p>
        </div>
      </div>

      {P.rx.length > 0 && (
        <div className="rides">
          {P.rx.map((rx, i) => (
            <div key={rx.code + i}>
              {i > 0 && <div className="or">or</div>}
              <RideCard rx={rx} />
            </div>
          ))}
        </div>
      )}
      <FlagList flags={flags} />

      <p className="muted small" style={{ marginTop: 12 }}>
        Do the days in any order. Jarvis ticks a day when the watch records it, and the next day is the first one not done yet. Swap or move days on Telegram.
        {last && <> Last: day {last.day} {last.status === 'skip' ? 'skipped' : 'done'} {fmtD(last.date)}.</>}
      </p>
      <details className="more">
        <summary>When to ride · phase progression</summary>
        <div className="list" style={{ marginTop: 6 }}>
          {SHIFTS.map((x) => (
            <div key={x.shift} className="li"><span>{x.shift}</span><span className="muted" style={{ textAlign: 'right' }}>{x.win}<br /><span className="small">{x.note}</span></span></div>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 6 }}>Avoid {AVOID_WINDOW}.</p>
        <p className="small" style={{ marginTop: 8 }}><b>{BIKE_PHASES[P.ph].n}:</b> {BIKE_PHASES[P.ph].prog} {BIKE_PHASES[P.ph].rides[0] === BIKE_PHASES[P.ph].rides[1] ? BIKE_PHASES[P.ph].rides[0] : BIKE_PHASES[P.ph].rides.join('–')} rides per cycle, max {BIKE_PHASES[P.ph].hardCap} hard per {HARD_WINDOW_DAYS} days.</p>
      </details>
    </div>
  );
}

// ── Ride ────────────────────────────────────────────────────────────────────
function RideTab({ ctx }: { ctx: Ctx }) {
  const [view, setView] = useState<'rides' | 'bench'>('rides');
  return (
    <section className="stack">
      <div className="seg" role="group" aria-label="Ride view">
        <button type="button" aria-pressed={view === 'rides'} onClick={() => setView('rides')}>Rides</button>
        <button type="button" aria-pressed={view === 'bench'} onClick={() => setView('bench')}>Benchmarks</button>
      </div>
      {view === 'rides' ? <RidesView ctx={ctx} /> : <BenchView ctx={ctx} />}
    </section>
  );
}

function RidesView({ ctx }: { ctx: Ctx }) {
  const { v, b, data, T } = ctx;
  const t = dn(T), R = v.sorted('rides');
  const sl: number[] = [];
  for (let d = t - 6; d <= t; d++) { const r = data.recovery[iso(d)]; if (r && Number.isFinite(num(r.sleep))) sl.push(num(r.sleep)); }
  const Wk = b.week(T);
  const x0 = t - 13, sp: Array<[number, number, string]> = [], stp: Array<[number, number, string]> = [];
  for (let d = x0; d <= t; d++) {
    const r = data.recovery[iso(d)];
    if (r && Number.isFinite(num(r.sleep))) sp.push([d, num(r.sleep), num(r.sleep) < 7 ? 'lo' : '']);
    if (r && Number.isFinite(num(r.steps))) stp.push([d, num(r.steps), num(r.steps) < 7000 ? 'lo' : '']);
  }
  const fmtRange = (r: [number, number]) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`);

  return (
    <>
      <div className="tiles">
        <Tile lbl="Z2 this week" v={Wk.z2} u={`/ ${Wk.z2Target} min`}
          sub={Wk.z2 >= Wk.z2Target ? <span className="down">Target hit</span> : Wk.z2Est ? 'Week ' + Wk.wk + ' · incl. estimates' : 'Week ' + Wk.wk} />
        <Tile lbl="Hard rides" v={Wk.hard} u={`/ ${Wk.cap}`}
          sub={Wk.hard > Wk.cap ? <span className="up">Over the cap</span> : `Rolling ${HARD_WINDOW_DAYS} days`} />
        <Tile lbl="Ride time" v={Math.round(Wk.minutes / 6) / 10} u="h" sub={`${Wk.rides} ride${Wk.rides === 1 ? '' : 's'} · plan ${fmtRange(Wk.ridesTarget)} / cycle`} />
        <Tile lbl="Sleep" v={sl.length ? k1(sum(sl) / sl.length) : '—'} u="h" sub={sl.length ? '7-day average' : 'From Garmin'} />
      </div>

      <div className="card">
        <div className="card-head"><h2>Rides</h2><span className="label">Latest first</span></div>
        <div className="list">
          {R.length ? R.slice(-10).reverse().map((r) => {
            const f = b.rideFlags(r, T);
            return (
              <details key={r.id} className="wo">
                <summary>
                  <span>{fmtD(r.date)} · <span className={`st ${(r.code ? RIDES[r.code].hard : r.type === 'hard') ? 'warn' : 'info'}`}>{r.code ?? r.type}</span>{f.length > 0 && <span className="st warn" style={{ marginLeft: 4 }}>!</span>}</span>
                  <span>{r.minutes} min{r.km ? ` · ${r.km} km` : ''}{r.hr ? ` · ${r.hr} bpm` : ''}</span>
                </summary>
                <div className="body">
                  {r.code ? RIDES[r.code].n : r.type === 'hard' ? 'Hard ride' : 'Easy ride'}
                  {r.maxHr ? ` · max ${r.maxHr} bpm` : ''}{r.cadence ? ` · ${r.cadence} rpm` : ''}{r.z2 != null ? ` · ${r.z2} min Z2` : ''}
                  {r.notes && <><br />{r.notes}</>}
                  {f.map((x, i) => <span key={i}><br /><span style={{ color: 'var(--warn)' }}>{x.t}</span></span>)}
                </div>
                <div className="acts">
                  {r.strava && /^https?:\/\//.test(r.strava) && <a className="btn sm ghost" href={r.strava} target="_blank" rel="noreferrer">Strava</a>}
                </div>
              </details>
            );
          }) : <p className="muted small">No rides yet.</p>}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Heart-rate zones</h2><span className="label">Max HR 186</span></div>
        <div className="list">
          {ZONES.map((z) => (
            <div key={z.id} className="li"><span><b>{z.id}</b> {z.n}</span><span className="muted" style={{ textAlign: 'right' }}>{z.min ? `${z.min}–${z.max}` : `under ${z.max + 1}`} bpm<br /><span className="small">{z.feel}</span></span></div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Sleep</h2><span className="label">Target 7–9 h</span></div>
        {sp.length ? (
          <Chart h={130} x0={x0 - 0.6} x1={t + 0.6} y0={0} y1={Math.max(9.5, ...sp.map((p) => p[1]))} xt={dateTicks(x0, t, 3)} aria="Sleep hours"
            layers={[{ type: 'bars', pts: sp }, { type: 'hline', y: 7, label: '7 h' }]} />
        ) : <div className="empty">Sleep from Garmin lands here after each sync.</div>}
        <div className="card-head" style={{ marginTop: 14 }}><h2>Steps</h2><span className="label">7,000–10,000 on non-ride days</span></div>
        {stp.length ? (
          <Chart h={130} x0={x0 - 0.6} x1={t + 0.6} y0={0} y1={Math.max(10000, ...stp.map((p) => p[1])) * 1.08} xt={dateTicks(x0, t, 3)}
            yFmt={(n) => (n >= 1000 ? `${n / 1000}k` : String(n))} aria="Steps"
            layers={[{ type: 'bars', pts: stp }, { type: 'hline', y: 7000, label: '7,000' }]} />
        ) : <div className="empty">Steps from Garmin land here after each sync.</div>}
      </div>
    </>
  );
}

// ── Ride: benchmarks ────────────────────────────────────────────────────────
function BenchView({ ctx }: { ctx: Ctx }) {
  const { b, put, del, toast, T } = ctx;
  const due = b.retestDue(T);
  const [id, setId] = useState<BenchId>('aerobic');
  const [date, setDate] = useState(T);
  const [val, setVal] = useState('');
  const [hr, setHr] = useState('');
  const B = BENCHMARKS.find((x) => x.id === id)!;
  const h = num(hr);
  const overCap = B.hrCap != null && Number.isFinite(h) && h > B.hrCap;

  async function save() {
    const x = B.kind === 'time' ? parseTime(val) : num(val);
    if (!date || !(x > 0)) { toast(B.kind === 'time' ? 'Enter the moving time, e.g. 20:46' : 'Enter the average cadence in rpm.'); return; }
    const now = Date.now();
    const doc: BenchDoc = { date, bench: id, source: 'manual', savedAt: now };
    if (B.kind === 'time') doc.sec = Math.round(x); else doc.rpm = Math.round(x);
    if (Number.isFinite(h)) doc.hr = Math.round(h);
    if (await put('benchmarks', `${id}_${date}_${now.toString(36)}`, doc)) { setVal(''); setHr(''); toast(`${B.n} saved`); }
  }

  return (
    <>
      {due && <div className="banner" style={{ marginBottom: 0 }}>Deload week {due.wk} is ending: time to retest the aerobic and climb segments.</div>}
      <div className="card">
        <div className="card-head"><h2>Log a retest</h2></div>
        <div className="seg" role="group" aria-label="Benchmark">
          {BENCHMARKS.map((x) => (
            <button key={x.id} type="button" aria-pressed={x.id === id} onClick={() => { setId(x.id); setVal(''); }}>{x.n.replace(' test', '')}</button>
          ))}
        </div>
        <p className="guide" style={{ marginTop: 10 }}>{B.how}</p>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="field"><label htmlFor="bmDate">Date</label><input id="bmDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label htmlFor="bmVal">{B.kind === 'time' ? 'Moving time (m:ss)' : 'Cadence (rpm)'}</label>
            <input id="bmVal" inputMode={B.kind === 'time' ? 'text' : 'numeric'} placeholder={B.kind === 'time' ? mmss(B.base.sec ?? 0) : '80'} value={val} onChange={(e) => setVal(e.target.value)} /></div>
          <div className="field"><label htmlFor="bmHr">Avg HR</label><input id="bmHr" inputMode="numeric" placeholder={String(B.base.hr ?? '')} value={hr} onChange={(e) => setHr(e.target.value)} /></div>
        </div>
        {overCap && <p className="small" style={{ marginTop: 8, color: 'var(--warn)' }}>Over the {B.hrCap} bpm cap: this run won't compare with the baseline. Retest easier.</p>}
        <button type="button" className="btn wide" style={{ marginTop: 12 }} onClick={() => void save()}>Save result</button>
      </div>

      {BENCHMARKS.map((x) => {
        const pts = b.series(x.id);
        const base = pts.find((p) => p.base), last = pts[pts.length - 1];
        const fmt = (n: number) => (x.kind === 'time' ? mmss(n) : `${Math.round(n)}`);
        const diff = base && last && last !== base ? last.val - base.val : null;
        const better = diff === null ? null : x.kind === 'time' ? diff < 0 : diff > 0;
        const xs = pts.map((p) => dn(p.date)), ys = pts.map((p) => p.val);
        const tgt = x.target;
        const y0 = Math.min(...ys, ...(tgt ? [tgt[0]] : [])), y1 = Math.max(...ys, ...(tgt ? [tgt[0]] : []));
        const pad = Math.max((y1 - y0) * 0.15, x.kind === 'time' ? 10 : 3);
        const a = Math.min(...xs), z = Math.max(...xs);
        return (
          <div key={x.id} className="card">
            <div className="card-head"><h2>{x.n}</h2><span className="label">{x.better}</span></div>
            <p className="muted small">{x.how}</p>
            <div className="tiles" style={{ marginTop: 10 }}>
              <Tile lbl="Baseline" v={base ? fmt(base.val) : '—'} u={x.kind === 'rpm' ? 'rpm' : ''} sub={base ? `${fmtD(base.date)}${base.hr ? ` · ${base.hr} bpm` : ''}` : ''} />
              <Tile lbl="Latest" v={last && last !== base ? fmt(last.val) : '—'} u={x.kind === 'rpm' ? 'rpm' : ''}
                sub={diff === null ? 'No retest yet' : <span className={better ? 'down' : 'up'}>{diff > 0 ? '+' : '−'}{x.kind === 'time' ? mmss(Math.abs(diff)) : Math.abs(Math.round(diff))} vs baseline</span>} />
            </div>
            {pts.length > 1 ? (
              <Chart h={130} x0={a - 1} x1={z + 1} y0={y0 - pad} y1={y1 + pad} xt={dateTicks(a, z, z - a > 20 ? 3 : 2)}
                yFmt={x.kind === 'time' ? (n) => mmss(n) : undefined} aria={`${x.n} results`}
                layers={[
                  ...(tgt ? [{ type: 'hline' as const, y: tgt[0], label: `${tgt[0]} rpm` }] : []),
                  { type: 'line', pts: pts.map((p) => [dn(p.date), p.val] as [number, number]) },
                  { type: 'dots', pts: pts.map((p) => [dn(p.date), p.val] as [number, number]), cls: 'acc' },
                ]} />
            ) : <div className="empty" style={{ marginTop: 10 }}>Retests land here as a trend against the baseline.</div>}
            <div className="list" style={{ marginTop: 8 }}>
              {pts.slice().reverse().slice(0, 6).map((p, i) => (
                <div key={p.id ?? `${p.date}${i}`} className="li">
                  <span>{fmtD(p.date)} · <span className="st info">{p.src}</span></span>
                  <span>{fmt(p.val)}{x.kind === 'rpm' ? ' rpm' : ''}{p.hr ? ` · ${p.hr} bpm` : ''}</span>
                  {p.id ? <ConfirmButton className="x" onConfirm={() => void del('benchmarks', p.id!)} /> : <span className="x" aria-hidden />}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── Settings sheet ──────────────────────────────────────────────────────────
function SettingsSheet({ ctx, onClose, onSignOut }: {
  ctx: Ctx; onClose: () => void; onSignOut: () => void;
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
            <p className="muted small">Added to every phase target. When the coach suggests a change, set it here.</p>
          </div>
          <div className="row">
            <button type="button" className="btn ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={() => void save()}>Save</button>
          </div>
          <hr />
          <div className="row">
            <button type="button" className="btn danger" style={{ flex: 1 }} onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </div>
    </div>
  );
}
