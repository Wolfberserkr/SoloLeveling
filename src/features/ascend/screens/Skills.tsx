import { useSearchParams } from 'react-router-dom';
import { addDays, levelFromXp, levelInfo, tally, titleFor } from '../logic';
import { useAscend } from '../store';
import { Bar, Icon, cvar, fmt, fmtDate } from '../ui';

export function SkillsScreen() {
  const data = useAscend((s) => s.data);
  const today = useAscend((s) => s.today);
  const [params, setParams] = useSearchParams();
  const t = tally(data);
  const sid = data.stats.some((s) => s.id === params.get('stat')) ? params.get('stat')! : data.stats[0]?.id;
  const stat = data.stats.find((s) => s.id === sid);
  if (!stat) return null;
  const subs = data.subskills.filter((s) => s.statId === sid).sort((a, b) => a.position - b.position);
  const nodeId = subs.some((s) => s.id === params.get('node')) ? params.get('node') : null;
  const li = levelInfo(t.stat[sid] ?? 0);
  const rootOnly = (t.stat[sid] ?? 0) - subs.reduce((a, x) => a + (t.sub[x.id] ?? 0), 0);
  const c = { '--c': cvar(stat.color) } as React.CSSProperties;
  const pick = (stat: string, node?: string | null) => setParams(node ? { stat, node } : { stat }, { replace: true });

  let detail: React.ReactNode = null;
  if (nodeId) {
    const x = subs.find((s) => s.id === nodeId)!;
    const l = levelInfo(t.sub[nodeId] ?? 0);
    const recent = data.completions.filter((cc) => cc.subId === nodeId).sort((a, b) => b.createdAt - a.createdAt);
    const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
    const per = days.map((k) => recent.filter((cc) => cc.localDate === k).reduce((a, cc) => a + cc.xp, 0));
    const mx = Math.max(1, ...per);
    detail = (
      <section className="card" style={c}>
        <div className="card-head"><div><div className="eyebrow">{stat.name} branch</div><h2>{x.name}</h2></div><span className="num" style={{ fontWeight: 600, color: 'var(--c)' }}>Lv {l.level}</span></div>
        <div className="spark" aria-label="XP per day, last 30 days">{per.map((v, i) => <i key={days[i]} className={v ? '' : 'z'} style={{ height: `${v ? Math.max(8, (v / mx) * 100) : 6}%` }} />)}</div>
        <div className="hero-foot" style={{ margin: '6px 0 12px' }}><span>Last 30 days</span><span className="num">{fmt(per.reduce((a, b) => a + b, 0))} XP</span></div>
        {recent.length ? recent.slice(0, 8).map((cc) => (
          <div key={cc.id} className="lrow"><div className="qmain"><span className="qtitle">{cc.title}</span><span className="qmeta">{fmtDate(cc.localDate, true)}</span></div><span className="xp num">+{cc.xp}</span></div>
        )) : <p className="muted" style={{ fontSize: 14 }}>No quests on this branch yet. Tag a quest with {x.name} and its XP grows here.</p>}
      </section>
    );
  }

  return (
    <>
      <header className="pagehead"><h1>Skill Trees</h1><p className="muted">Every branch is an ability you are unlocking, not something to fix.</p></header>
      <div className="treepick" role="group" aria-label="Choose a stat">
        {data.stats.map((x) => (
          <button key={x.id} className="chip" style={{ '--c': cvar(x.color) } as React.CSSProperties} aria-pressed={x.id === sid} onClick={() => pick(x.id)}>
            {x.icon} {x.name} <span className="n">{levelFromXp(t.stat[x.id] ?? 0)}</span>
          </button>
        ))}
      </div>
      <div className="cols">
        <section className="card" style={c}>
          <div className="tree-root">
            <span className="orb">{stat.icon}</span>
            <div className="info">
              <div className="eyebrow" style={{ color: 'var(--c)' }}>Level {li.level} · {titleFor(li.level)}</div>
              <h2>{stat.name}</h2>
              <Bar pct={li.pct} />
              <span className="num muted" style={{ fontSize: 12.5 }}>{fmt(t.stat[sid] ?? 0)} XP{rootOnly > 0 ? ` · ${fmt(rootOnly)} earned without a branch` : ''}</span>
            </div>
          </div>
          {subs.length ? (
            <ul className="branches">
              {subs.map((x) => {
                const xp = t.sub[x.id] ?? 0, l = levelInfo(xp), g = Math.sqrt((l.level - 1) / 99);
                const style = { '--mix': `${(4 + g * 36).toFixed(0)}%`, '--edge': `${(20 + g * 50).toFixed(0)}%`, '--orb': `${(16 + g * 70).toFixed(0)}%`, '--sz': `${(40 + g * 20).toFixed(0)}px` } as React.CSSProperties;
                return (
                  <li key={x.id} className="branch">
                    <button className={`node${xp === 0 ? ' fresh' : ''}`} style={style} aria-pressed={nodeId === x.id} onClick={() => pick(sid, nodeId === x.id ? null : x.id)}>
                      <span className="nodeorb">{l.level}</span>
                      <span className="nb">
                        <span className="nn">{x.name}{x.note ? <span className="faint" style={{ fontWeight: 400 }}> · {x.note}</span> : null}</span>
                        <Bar pct={l.pct} />
                        <span className="nm num">{xp === 0 ? 'First XP unlocks this branch' : `${fmt(xp)} XP · ${fmt(l.toNext)} to level ${l.level + 1}`}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="muted" style={{ padding: '14px 4px', fontSize: 14 }}>No branches yet. Add sub-skills in Settings.</p>}
        </section>
        <div className="stack">
          {detail ?? (
            <section className="card"><div className="empty" style={{ padding: '18px 8px' }}><div className="glyph"><Icon name="branch" /></div><h3>Tap a branch</h3><p>See the quests that grew it and its XP over the last 30 days. Branches brighten and grow as they level.</p></div></section>
          )}
        </div>
      </div>
    </>
  );
}
