import { ASCEND, bestStreak, currentStreak, levelUpEvents, tally, titleFor, weekReviewed, weekStart, weekdayOf } from '../logic';
import { useAscend } from '../store';
import { cvar, fmt, fmtDate, statVar } from '../ui';
import { Donut, Heatmap, Weekly, XpPerDay } from '../charts';
import { Hall } from './Quests';

export function StatsScreen() {
  const data = useAscend((s) => s.data);
  const today = useAscend((s) => s.today);
  const openSheet = useAscend((s) => s.openSheet);
  const t = tally(data);
  const bossesDone = data.bosses.filter((b) => b.defeatedAt).sort((a, b) => ((a.defeatedAt ?? '') < (b.defeatedAt ?? '') ? 1 : -1));
  const ev = levelUpEvents(data).slice(0, 14);
  const wk = weekStart(today);
  const weekXp = data.completions.filter((c) => c.localDate >= wk).reduce((a, c) => a + c.xp, 0);
  const reviewed = weekReviewed(data, today);
  const isSunday = weekdayOf(today) === 0;
  const empty = !data.completions.length;
  const statName = (id: string | null | undefined) => data.stats.find((s) => s.id === id);
  const reviews = [...data.reviews].sort((a, b) => (a.localDate < b.localDate ? 1 : -1));

  return (
    <>
      <header className="pagehead"><h1>Stats & History</h1><p className="muted">Long-term progression matters more than any single day.</p></header>
      <div className="kpis">
        <div className="kpi"><span className="v">{fmt(t.total)}</span><span className="k">Lifetime XP</span></div>
        <div className="kpi"><span className="v">{fmt(weekXp)}</span><span className="k">XP this week</span></div>
        <div className="kpi"><span className="v">{fmt(data.completions.length)}</span><span className="k">Quests completed</span></div>
        <div className="kpi"><span className="v">{bossesDone.length}</span><span className="k">Bosses defeated</span></div>
      </div>
      <div className="cols">
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>XP per day</h2><span className="muted">Last 30 days, by stat</span></div>
            {empty ? <p className="muted" style={{ fontSize: 14 }}>Complete a quest and the chart starts here.</p> : <XpPerDay data={data} today={today} />}
          </section>
          <section className="card">
            <div className="card-head"><h2>Quests completed per week</h2><span className="muted">Last 8 weeks</span></div>
            {empty ? <p className="muted" style={{ fontSize: 14 }}>Weekly totals appear once you finish your first quest.</p> : <Weekly data={data} today={today} />}
          </section>
          <section className="card">
            <div className="card-head"><h2>Streak history</h2><span className="muted num">now {currentStreak(data, today)} · best {bestStreak(data, today)}</span></div>
            <Heatmap data={data} today={today} />
            <p className="hint" style={{ marginTop: 10 }}>A day counts when {ASCEND.streakDayMinimum} of its daily quests are done. Streaks earn no bonus XP and breaking one costs nothing.</p>
          </section>
          <section className="review">
            <div className="setrow">
              <div><div className="eyebrow" style={{ color: 'var(--c-indigo)' }}>Weekly review</div><h2>{reviewed ? 'Done for this week' : isSunday ? "It's Sunday. Look back, then look ahead." : 'Ready when you are'}</h2></div>
              <span className="pill num">+{ASCEND.reviewXp} XP</span>
            </div>
            <p className="muted" style={{ fontSize: 14 }}>{reviewed ? 'Your next review opens on Monday. Sundays are the default.' : 'Wins this week, what slipped, one focus stat for next week, one Stoic reflection.'}</p>
            {!reviewed && <div><button className="btn primary sm" onClick={() => openSheet({ kind: 'review' })}>Start weekly review</button></div>}
          </section>
          {reviews.length > 0 && (
            <section className="card">
              <div className="card-head"><h2>Past reviews</h2><span className="muted num">{reviews.length}</span></div>
              <div className="revlist">
                {reviews.map((r) => (
                  <details key={r.id} className="rev">
                    <summary><span>Week of {fmtDate(r.weekStart, true)}</span><span className="faint" style={{ fontWeight: 400 }}>{statName(r.focusStat)?.icon} {statName(r.focusStat)?.name}</span></summary>
                    <dl>
                      <dt>Wins</dt><dd>{r.wins || '—'}</dd>
                      <dt>What slipped</dt><dd>{r.slipped || '—'}</dd>
                      <dt>Focus next week</dt><dd>{statName(r.focusStat)?.name ?? '—'}</dd>
                      <dt>Stoic reflection</dt><dd>{r.stoic || '—'}</dd>
                    </dl>
                  </details>
                ))}
              </div>
            </section>
          )}
        </div>
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>XP by stat</h2><span className="muted num">{fmt(t.total)} total</span></div>
            {empty ? <p className="muted" style={{ fontSize: 14 }}>Your balance across the seven stats shows up here.</p> : (
              <div className="donut-row">
                <Donut data={data} />
                <ul className="legend">
                  {[...data.stats].sort((a, b) => (t.stat[b.id] ?? 0) - (t.stat[a.id] ?? 0)).map((s) => (
                    <li key={s.id} style={{ '--c': cvar(s.color) } as React.CSSProperties}>
                      <i className="dot" /><span className="lname">{s.name}</span>
                      <span className="lval">{fmt(t.stat[s.id] ?? 0)} · {t.total ? Math.round(((t.stat[s.id] ?? 0) / t.total) * 100) : 0}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
          <section className="card">
            <div className="card-head"><h2>Level-ups</h2><span className="muted">Most recent first</span></div>
            {ev.length ? (
              <ul className="timeline">
                {ev.map((e) => e.kind === 'overall'
                  ? <li key={`o${e.ts}`} className="big" style={{ '--c': 'var(--fg)' } as React.CSSProperties}>Reached level {e.level} <span className="pill">{titleFor(e.level)}</span><span className="when">{fmtDate(e.date)}</span></li>
                  : <li key={`s${e.ts}${e.statId}`} style={statVar(data, e.statId)}>{statName(e.statId)?.icon} {statName(e.statId)?.name} → {e.level}<span className="when">{fmtDate(e.date)}</span></li>)}
              </ul>
            ) : <p className="muted" style={{ fontSize: 14 }}>Level 2 takes 100 XP. Your first level-up will be logged here.</p>}
          </section>
          <section className="card">
            <div className="card-head"><h2>Bosses defeated</h2><span className="muted num">{bossesDone.length}</span></div>
            {bossesDone.length ? <Hall bosses={bossesDone} /> : <p className="muted" style={{ fontSize: 14 }}>None yet. {data.bosses.length ? `${data.bosses.length} waiting in the Quest Log.` : 'Name the thing you have been avoiding.'}</p>}
          </section>
        </div>
      </div>
    </>
  );
}
