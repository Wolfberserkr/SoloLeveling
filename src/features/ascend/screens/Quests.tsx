import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ASCEND, bestStreak, currentStreak, dailyCount, dailyQuests, daysBetween, doneIndex, weekdayOf,
  DAYNAMES, DAYS, WEEK_ORDER, type ABoss, type ACompletion,
} from '../logic';
import { openFocus, useAscend } from '../store';
import { Empty, Icon, Ring, fmt, fmtDate, fmtMonthYear, statLabel, statVar, useConfirm, cvar } from '../ui';
import { bossDraft, editDraft, newDraft } from '../drafts';
import { useCoach } from '../coach';

type Tab = 'daily' | 'side' | 'main' | 'bosses' | 'done';
const TABS: Array<[Tab, string]> = [['daily', 'Daily'], ['side', 'Side'], ['main', 'Main'], ['bosses', 'Bosses'], ['done', 'Completed']];
const KIND_LABEL: Record<ACompletion['kind'], string> = { daily: 'Daily', side: 'Side', focus: 'Focus', milestone: 'Milestone', boss: 'Boss', review: 'Review' };

export function QuestsScreen() {
  const data = useAscend((s) => s.data);
  const today = useAscend((s) => s.today);
  const openSheet = useAscend((s) => s.openSheet);
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'daily') as Tab;
  const [filter, setFilter] = useState<string>('all');
  const pass = (statId: string) => filter === 'all' || statId === filter;

  const sides = data.quests.filter((q) => q.type === 'side' && !q.doneAt);
  const mains = data.quests.filter((q) => q.type === 'main');
  const bosses = data.bosses.filter((b) => !b.defeatedAt);
  const counts: Record<Tab, number> = {
    daily: dailyQuests(data).length, side: sides.length,
    main: mains.filter((q) => { const ms = data.milestones.filter((m) => m.questId === q.id); return !ms.length || ms.some((m) => !m.doneAt); }).length,
    bosses: bosses.length, done: data.completions.length,
  };
  const filterStat = filter !== 'all' ? data.stats.find((s) => s.id === filter)?.id ?? null : null;

  return (
    <>
      <header className="pagehead"><h1>Quest Log</h1><p className="muted">Concrete actions you can finish. Missing one never costs XP.</p></header>
      <div className="seg" role="tablist" aria-label="Quest type">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" className="seg-btn" aria-selected={tab === k} onClick={() => setParams(k === 'daily' ? {} : { tab: k }, { replace: true })}>
            {l}<span className="seg-n num">{counts[k]}</span>
          </button>
        ))}
      </div>
      <div className="chips filter" role="group" aria-label="Filter by stat">
        <button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All stats</button>
        {data.stats.map((s) => (
          <button key={s.id} className="chip" style={{ '--c': cvar(s.color) } as React.CSSProperties} aria-pressed={filter === s.id} onClick={() => setFilter(s.id)}>{s.icon} {s.name}</button>
        ))}
      </div>
      {tab === 'daily' && <DailyTab pass={pass} />}
      {tab === 'side' && (
        <section className="card">
          {sides.filter((q) => pass(q.statId)).length ? (
            <ul className="qlist">
              {sides.filter((q) => pass(q.statId)).sort((a, b) => (a.due ?? '9999') < (b.due ?? '9999') ? -1 : 1).map((q) => (
                <li key={q.id} className="qrow" style={statVar(data, q.statId)}>
                  <CheckButton questId={q.id} label={q.title} />
                  <button className="qmain" onClick={() => openSheet({ kind: 'quest', draft: editDraft(q) })}>
                    <span className="qtitle">{q.title}</span>
                    <span className="qmeta"><i className="dot" />{statLabel(data, q.statId, q.subId)}{q.due ? ` · ${q.due < today ? 'was due' : 'due'} ${fmtDate(q.due)}` : ''}</span>
                  </button>
                  <span className="xp num">+{q.xp}</span>
                  {q.timed && <button className="iconbtn sm" aria-label="Start focus timer" onClick={() => openFocus(q.id)}><Icon name="timer" /></button>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="check" title={sides.length ? 'Nothing for this stat' : 'No side quests'}
              action={<button className="btn primary sm" onClick={() => openSheet({ kind: 'quest', draft: newDraft('side', [], filterStat) })}><Icon name="plus" />Add a side quest</button>}>
              One-off tasks with an optional due date. Keep them concrete: "Book the dentist", not "Sort out health stuff".
            </Empty>
          )}
        </section>
      )}
      {tab === 'main' && (
        mains.filter((q) => pass(q.statId)).length ? (
          <div className="stack" style={{ gap: 10 }}>
            {mains.filter((q) => pass(q.statId)).map((q) => {
              const ms = data.milestones.filter((m) => m.questId === q.id).sort((a, b) => a.position - b.position);
              const d = ms.filter((m) => m.doneAt).length, nx = ms.find((m) => !m.doneAt);
              return (
                <button key={q.id} className="maincard" style={statVar(data, q.statId)} onClick={() => openSheet({ kind: 'main', id: q.id })}>
                  <Ring pct={ms.length ? d / ms.length : 0} size={58} />
                  <span className="body">
                    <span className="qtitle" style={{ fontWeight: 600 }}>{q.title}</span>
                    <span className="qmeta"><i className="dot" />{statLabel(data, q.statId, q.subId)}{q.target ? ` · target ${fmtMonthYear(q.target)}` : ''}</span>
                    <span className="next">{nx ? <>Next: {nx.title} <span className="num">+{nx.xp}</span></> : ms.length ? 'All milestones complete' : 'No milestones yet'}</span>
                  </span>
                  <span className="faint"><Icon name="chev" /></span>
                </button>
              );
            })}
          </div>
        ) : (
          <section className="card">
            <Empty icon="star" title={mains.length ? 'Nothing for this stat' : 'No main quests'}
              action={<button className="btn primary sm" onClick={() => openSheet({ kind: 'quest', draft: newDraft('main', [], filterStat) })}><Icon name="plus" />Add a main quest</button>}>
              Long-term goals broken into ordered milestones. Each milestone is a quest you can finish and earn XP for.
            </Empty>
          </section>
        )
      )}
      {tab === 'bosses' && <BossesTab pass={pass} filterStat={filterStat} />}
      {tab === 'done' && <DoneTab pass={pass} />}
    </>
  );
}

function CheckButton({ questId, label }: { questId: string; label: string }) {
  const complete = useAscend((s) => s.complete);
  return (
    <button className="check" aria-label={`Complete: ${label}`} onClick={(e) => {
      const r = e.currentTarget.getBoundingClientRect();
      void complete(questId, { x: r.left + r.width / 2, y: r.top - 6 });
    }}><Icon name="check" /></button>
  );
}

function DailyTab({ pass }: { pass: (statId: string) => boolean }) {
  const data = useAscend((s) => s.data);
  const today = useAscend((s) => s.today);
  const openSheet = useAscend((s) => s.openSheet);
  const [sel, setSel] = useState(weekdayOf(today));
  const n = dailyCount(data, sel);
  const list = dailyQuests(data, sel).filter((q) => pass(q.statId));
  const idx = doneIndex(data);
  return (
    <>
      <div className="week" role="group" aria-label="Weekday">
        {WEEK_ORDER.map((wd) => {
          const c = dailyCount(data, wd);
          return (
            <button key={wd} className={`day ${c >= ASCEND.daily.max ? 'full' : c < ASCEND.daily.min ? 'low' : ''} ${wd === weekdayOf(today) ? 'today' : ''}`}
              aria-pressed={sel === wd} aria-label={`${DAYNAMES[wd]}: ${c} of ${ASCEND.daily.max}`} onClick={() => setSel(wd)}>
              <span className="dn">{DAYS[wd]}</span><span className="dc">{c}/{ASCEND.daily.max}</span>
            </button>
          );
        })}
      </div>
      <section className="card">
        <div className="card-head"><h2>{DAYNAMES[sel]}</h2><span className="muted num">{n} / {ASCEND.daily.max} non-negotiables</span></div>
        {n > 0 && n < ASCEND.daily.min && <div className="note warn" style={{ marginBottom: 10 }}><div className="grow">Only {n} on {DAYNAMES[sel]}. Aim for {ASCEND.daily.min}–{ASCEND.daily.max}.</div></div>}
        {n >= ASCEND.daily.max && <p className="hint" style={{ marginBottom: 8 }}>{DAYNAMES[sel]} is full. To add a quest here, swap one out first.</p>}
        {list.length ? (
          <div>
            {list.map((q) => {
              const cur = currentStreak(data, today, q.id), best = bestStreak(data, today, q.id);
              const done = sel === weekdayOf(today) && idx.get(q.id)?.has(today);
              return (
                <div key={q.id} className="lrow" style={statVar(data, q.statId)}>
                  <span className="dot" style={{ width: 10, height: 10 }} />
                  <button className="qmain" onClick={() => openSheet({ kind: 'quest', draft: editDraft(q) })}>
                    <span className="qtitle">{q.title}</span>
                    <span className="qmeta">{statLabel(data, q.statId, q.subId)} · {WEEK_ORDER.filter((d) => q.days.includes(d)).map((d) => DAYS[d]).join(' ')}</span>
                    <span className="qmeta">Streak {cur} · best {best}{q.timed ? ' · focus timer' : ''}{done ? ' · done today' : ''}</span>
                  </button>
                  <span className="xp num">+{q.xp}</span>
                </div>
              );
            })}
          </div>
        ) : n ? (
          <p className="muted" style={{ padding: '12px 0' }}>No quests for this stat on {DAYNAMES[sel]}.</p>
        ) : (
          <Empty icon="list" title={`Nothing on ${DAYNAMES[sel]} yet`}
            action={<button className="btn primary sm" onClick={() => openSheet({ kind: 'quest', draft: newDraft('daily', [sel]) })}><Icon name="plus" />Add a daily quest</button>}>
            Daily quests are your non-negotiables. Make each one an action you can finish, like "Read 10 pages".
          </Empty>
        )}
      </section>
    </>
  );
}

export function BossCard({ b }: { b: ABoss }) {
  const data = useAscend((s) => s.data);
  const today = useAscend((s) => s.today);
  const defeat = useAscend((s) => s.defeat);
  const openSheet = useAscend((s) => s.openSheet);
  const confirm = useConfirm();
  const days = b.avoidingSince ? daysBetween(b.avoidingSince, today) : null;
  const armed = confirm.armed === b.id;
  return (
    <article className="boss" style={statVar(data, b.statId)}>
      <div className="boss-top">
        <span className="flame"><Icon name="flame" /></span>
        <div style={{ minWidth: 0, display: 'grid', gap: 3, flex: 1 }}><h3>{b.title}</h3><span className="qmeta"><i className="dot" />{statLabel(data, b.statId, b.subId)}</span></div>
        <button className="iconbtn sm" aria-label="Edit boss" onClick={() => openSheet({ kind: 'quest', draft: bossDraft(b) })}><Icon name="edit" /></button>
      </div>
      {b.why && <p className="why">{b.why}</p>}
      <div className="boss-foot">
        <span className="avoid num">{days != null ? `Avoiding for ${days} ${days === 1 ? 'day' : 'days'}` : ''}</span>
        <button className={`btn ember sm${armed ? ' armed' : ''}`} onClick={() => { if (confirm.tap(b.id)) void defeat(b.id); }}>
          {armed ? 'Done it? Tap to confirm' : <><Icon name="flame" />Defeat · +{b.xp} XP</>}
        </button>
      </div>
    </article>
  );
}

export function Hall({ bosses }: { bosses: ABoss[] }) {
  return (
    <ul className="hall">
      {bosses.map((b) => (
        <li key={b.id}>
          <span className="trophy"><Icon name="trophy" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="qtitle">{b.title}</div>
            <div className="qmeta">Defeated {fmtDate(b.defeatedAt, true)}{b.avoidingSince && b.defeatedAt ? ` after ${daysBetween(b.avoidingSince, b.defeatedAt)} days` : ''}</div>
          </div>
          <span className="xp num">+{b.xp}</span>
        </li>
      ))}
    </ul>
  );
}

function BossesTab({ pass, filterStat }: { pass: (statId: string) => boolean; filterStat: string | null }) {
  const data = useAscend((s) => s.data);
  const openSheet = useAscend((s) => s.openSheet);
  const active = data.bosses.filter((b) => !b.defeatedAt);
  const list = active.filter((b) => pass(b.statId));
  const hall = data.bosses.filter((b) => b.defeatedAt).sort((a, b) => ((a.defeatedAt ?? '') < (b.defeatedAt ?? '') ? 1 : -1));
  return (
    <>
      {active.length > 1 && <div><button className="btn sm" onClick={() => { useCoach.getState().setTab('boss'); openSheet({ kind: 'coach' }); }}><Icon name="spark" />Which boss next?</button></div>}
      {list.length ? <div className="stack" style={{ gap: 12 }}>{list.map((b) => <BossCard key={b.id} b={b} />)}</div> : (
        <section className="card">
          <Empty icon="flame" title={active.length ? 'Nothing for this stat' : 'No bosses to face'}
            action={<button className="btn ember sm" onClick={() => openSheet({ kind: 'quest', draft: newDraft('boss', [], filterStat) })}><Icon name="flame" />Name a boss</button>}>
            The hard thing you have been avoiding: a difficult conversation, a pitch, an application. Worth {ASCEND.bossDefaultXp} XP on purpose.
          </Empty>
        </section>
      )}
      <section className="card">
        <div className="card-head"><h2>Bosses defeated</h2><span className="muted num">{hall.length}</span></div>
        {hall.length ? <Hall bosses={hall} /> : <p className="muted" style={{ fontSize: 14 }}>The hall is empty for now. The first one is the hardest.</p>}
      </section>
    </>
  );
}

function relDay(k: string, today: string) {
  if (k === today) return 'Today';
  if (daysBetween(k, today) === 1) return 'Yesterday';
  return `${DAYNAMES[weekdayOf(k)]}, ${fmtDate(k, k.slice(0, 4) !== today.slice(0, 4))}`;
}

function DoneTab({ pass }: { pass: (statId: string) => boolean }) {
  const data = useAscend((s) => s.data);
  const today = useAscend((s) => s.today);
  const remove = useAscend((s) => s.removeCompletion);
  const confirm = useConfirm();
  const [limit, setLimit] = useState(40);
  const list = data.completions.filter((c) => pass(c.statId)).sort((a, b) => b.createdAt - a.createdAt);
  const shown = list.slice(0, limit);
  const groups: Array<{ date: string; items: ACompletion[] }> = [];
  for (const c of shown) {
    const g = groups[groups.length - 1];
    if (g && g.date === c.localDate) g.items.push(c);
    else groups.push({ date: c.localDate, items: [c] });
  }
  if (!shown.length) {
    return <section className="card"><Empty icon="check" title="Nothing completed yet">Finished quests land here with the XP they earned. Missing a day never removes anything.</Empty></section>;
  }
  return (
    <section className="card">
      {groups.map((g) => (
        <div key={g.date} className="dgroup">
          <h4>{relDay(g.date, today)} · <span className="num">+{fmt(g.items.reduce((a, c) => a + c.xp, 0))} XP</span></h4>
          {g.items.map((c) => (
            <div key={c.id} className="lrow" style={statVar(data, c.statId)}>
              <span className="dot" style={{ width: 10, height: 10 }} />
              <div className="qmain">
                <span className="qtitle">{c.title}</span>
                <span className="qmeta">{KIND_LABEL[c.kind]}{c.parentTitle ? ` · ${c.parentTitle}` : ''} · {statLabel(data, c.statId, c.subId)}{c.minutes ? ` · ${c.minutes} min` : ''}</span>
              </div>
              <span className="xp num">+{c.xp}</span>
              {confirm.armed === c.id
                ? <button className="btn sm armed" onClick={() => { if (confirm.tap(c.id)) void remove(c.id); }}>Remove</button>
                : <button className="iconbtn sm" aria-label="Remove this entry" onClick={() => confirm.tap(c.id)}><Icon name="x" /></button>}
            </div>
          ))}
        </div>
      ))}
      {list.length > shown.length && <div style={{ textAlign: 'center', marginTop: 12 }}><button className="btn sm" onClick={() => setLimit(limit + 40)}>Show {Math.min(40, list.length - shown.length)} more</button></div>}
    </section>
  );
}
