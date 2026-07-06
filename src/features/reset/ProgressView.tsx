import { useState } from 'react';
import { NUTRITION_OPTIONS, exerciseById } from './resetData';
import { derivedPRs, useResetStore } from './resetStore';

function todayISO() { return new Date().toISOString().slice(0, 10); }

function NutritionSection() {
  const s = useResetStore((st) => st.s);
  const saveNutrition = useResetStore((st) => st.saveNutrition);
  const today = todayISO();
  const todayEntry = s.nutrition.find((n) => n.date === today);
  const [sel, setSel] = useState<string>(todayEntry?.rating ?? '');
  const [note, setNote] = useState<string>(todayEntry?.note ?? '');
  const recent = [...s.nutrition].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);

  return (
    <>
      <div className="section-head">How did you eat today?</div>
      <div className="nutrition-card">
        <div className="nutrition-bar">
          {NUTRITION_OPTIONS.map((o) => (
            <button key={o.key} className={`nutrition-btn ${sel === o.key ? 'sel' : ''}`} onClick={() => setSel(o.key)}>
              {o.label}
            </button>
          ))}
        </div>
        <textarea
          className="nutrition-note" rows={2} placeholder="Optional note…"
          value={note} onChange={(e) => setNote(e.target.value)}
        />
        <button
          className="btn-sm" style={{ marginTop: 8 }}
          onClick={() => { if (sel) saveNutrition(sel, note.trim()); }}
        >
          {todayEntry ? 'Update' : 'Save'}
        </button>
      </div>
      {recent.length > 0 && (
        <div className="nutr-list">
          {recent.map((n) => (
            <div key={n.date} className="nutr-history-item">
              <span>{new Date(n.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              <span className={`nutr-rating ${n.rating}`}>{n.rating}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function WeightChart({ weights }: { weights: { date: string; kg: number }[] }) {
  if (weights.length < 2) return <p className="muted-line">Log at least 2 weigh-ins to see your trend.</p>;
  const pts = weights.slice(-12);
  const vals = pts.map((p) => Number(p.kg));
  const minV = Math.min(...vals) - 1;
  const maxV = Math.max(...vals) + 1;
  const W = 360, H = 90, PAD = 10;
  const toX = (i: number) => PAD + (i / (pts.length - 1)) * (W - PAD * 2);
  const toY = (v: number) => PAD + (1 - (v - minV) / (maxV - minV)) * (H - PAD * 2);
  const poly = pts.map((_, i) => `${toX(i).toFixed(1)},${toY(vals[i]).toFixed(1)}`).join(' ');
  const diff = vals[vals.length - 1] - vals[0];
  const sign = diff > 0 ? '+' : '';
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} aria-label="Weight trend">
        <polyline points={poly} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((_, i) => (
          <circle key={i} cx={toX(i).toFixed(1)} cy={toY(vals[i]).toFixed(1)} r="3.5" fill="var(--accent)" />
        ))}
      </svg>
      <div className="trend-label">
        {vals[vals.length - 1].toFixed(1)} kg · change: {sign}{diff.toFixed(1)} kg over {pts.length} check-ins
      </div>
    </div>
  );
}

function WeightSection() {
  const s = useResetStore((st) => st.s);
  const logWeight = useResetStore((st) => st.logWeight);
  const [val, setVal] = useState('');
  return (
    <div className="weight-card">
      <div className="weight-form">
        <input
          type="number" inputMode="decimal" step="0.1" placeholder="kg"
          value={val} onChange={(e) => setVal(e.target.value)}
        />
        <button
          className="btn-sm"
          onClick={() => {
            const v = parseFloat(val);
            if (!v || v < 20 || v > 300) return;
            logWeight(v);
            setVal('');
          }}
        >
          Log weight
        </button>
      </div>
      <WeightChart weights={s.weights} />
    </div>
  );
}

function Calendar({ onOpenSession }: { onOpenSession: (dateKey: string) => void }) {
  const s = useResetStore((st) => st.s);
  const setCalMonth = useResetStore((st) => st.setCalMonth);
  const monthStr = s.calMonth || todayISO().slice(0, 7);
  const [y, m] = monthStr.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const startDow = (first.getDay() + 6) % 7;
  const sessionDays = new Set(s.history.map((x) => x.date.slice(0, 10)));
  const today = todayISO();

  function shift(delta: number) {
    const d = new Date(y, m - 1 + delta, 1);
    setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  function open(iso: string) {
    const sess = s.history.filter((x) => x.date.slice(0, 10) === iso);
    if (sess.length) onOpenSession(sess[sess.length - 1].date);
  }

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < startDow; i++) cells.push(<div key={`e${i}`} className="cal-cell empty" />);
  for (let d = 1; d <= last.getDate(); d++) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const has = sessionDays.has(iso);
    cells.push(
      <div
        key={iso}
        className={`cal-cell ${has ? 'has-session' : ''} ${iso === today ? 'today' : ''}`}
        onClick={has ? () => open(iso) : undefined}
      >
        {d}
      </div>,
    );
  }

  return (
    <div className="calendar-card">
      <div className="cal-head">
        <button className="step" onClick={() => shift(-1)}>‹</button>
        <span className="cal-title">{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
        <button className="step" onClick={() => shift(1)}>›</button>
      </div>
      <div className="cal-dow">{['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => <span key={d}>{d}</span>)}</div>
      <div className="cal-grid">{cells}</div>
    </div>
  );
}

/** Progress tab — nutrition, weigh-in, stats, PRs, calendar, session history. */
export function ProgressView({ onOpenSession }: { onOpenSession: (dateKey: string) => void }) {
  const s = useResetStore((st) => st.s);
  const total = s.history.length;
  const thisWeek = s.history.filter((x) => Date.now() - +new Date(x.date) < 7 * 86400000).length;
  const activeDays = new Set(s.history.map((x) => new Date(x.date).toDateString())).size;
  const prs = Object.entries(derivedPRs(s));
  const recent = [...s.history].reverse().slice(0, 30);

  return (
    <>
      <NutritionSection />

      <div className="section-head">Weekly weigh-in</div>
      <WeightSection />

      {total > 0 && (
        <>
          <div className="section-head">At a glance</div>
          <div className="stats">
            <div className="stat"><div className="n">{total}</div><div className="l">Sessions</div></div>
            <div className="stat"><div className="n">{thisWeek}</div><div className="l">This week</div></div>
            <div className="stat"><div className="n">{activeDays}</div><div className="l">Active days</div></div>
          </div>
        </>
      )}

      <div className="section-head">Personal records</div>
      {prs.length === 0 ? (
        <p className="muted-line">Log reps and weight on an exercise to start tracking PRs.</p>
      ) : (
        <div className="pr-grid">
          {prs.map(([exId, pr]) => {
            const ex = exerciseById(exId);
            if (!ex) return null;
            const when = pr.date ? new Date(pr.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'current';
            return (
              <div key={exId} className="pr-item">
                <div><div className="pr-name">{ex.name}</div><div className="pr-date">{when}</div></div>
                <span className="pr-val">{pr.weight} kg × {pr.reps}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="section-head">Calendar</div>
      <Calendar onOpenSession={onOpenSession} />

      <div className="section-head">Past sessions</div>
      {recent.length === 0 ? (
        <div className="empty">
          <div className="big">Nothing logged yet</div>
          <div className="small">Finish a session and it'll show up here.</div>
        </div>
      ) : (
        recent.map((x) => (
          <div key={x.date} className="hist-item" onClick={() => onOpenSession(x.date)}>
            <div>
              <div className="name">{x.name}</div>
              <div className="when">
                {new Date(x.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {new Date(x.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </div>
            </div>
            <span className="tag">{x.done}/{x.total} sets</span>
          </div>
        ))
      )}
    </>
  );
}
