import { useNavigate } from 'react-router-dom';
import {
  ASCEND, currentStreak, bestStreak, dailyQuests, doneIndex, lastScheduledMiss, levelInfo, tally, ticketStatus,
  titleFor, weekReviewed, weekdayOf, DAYNAMES, type AQuest,
} from '../logic';
import { openFocus, useAscend } from '../store';
import { Bar, Empty, Icon, cvar, fmt, fmtDate, statLabel, statVar } from '../ui';
import { Radar } from '../charts';
import { editDraft, newDraft } from '../drafts';

export function CharacterScreen() {
  const data = useAscend((s) => s.data);
  const today = useAscend((s) => s.today);
  const glow = useAscend((s) => s.levelGlow);
  const openSheet = useAscend((s) => s.openSheet);
  const navigate = useNavigate();

  const t = tally(data), L = levelInfo(t.total), wd = weekdayOf(today);
  const todays = dailyQuests(data, wd), idx = doneIndex(data);
  const done = todays.filter((q) => idx.get(q.id)?.has(today)).length;
  const tickets = ticketStatus(data), next = tickets.find((x) => x.status === 'locked'), ready = tickets.filter((x) => x.status === 'ready');
  const bosses = data.bosses.filter((b) => !b.defeatedAt);
  const cur = currentStreak(data, today), best = bestStreak(data, today);
  const missed = lastScheduledMiss(data, today);
  const sunday = wd === 0 && !weekReviewed(data, today);

  return (
    <div className="cols">
      <div className="stack">
        <section className="hero" aria-label="Character">
          <div className="hero-top">
            <div key={glow} className={`lvbadge${glow ? ' glow' : ''}`}><span className="l">LEVEL</span><span className="v">{L.level}</span></div>
            <div className="hero-id">
              <div className="eyebrow">{titleFor(L.level)}</div>
              <div className="xp-head"><span className="num big">{fmt(t.total)}</span><span className="unit">lifetime XP</span></div>
            </div>
          </div>
          <Bar pct={L.pct} lg />
          <div className="hero-foot">
            <span>{L.max ? 'Maximum level reached' : `Level ${L.level} → ${L.level + 1}`}</span>
            <span className="num">{L.max ? '' : `${fmt(L.toNext)} XP to go`}</span>
          </div>
          <p className="tagline"><b>The point:</b> {ASCEND.tagline}</p>
        </section>

        <div className="minis">
          <button className="mini gold" onClick={() => navigate('/ascend/rewards')}>
            <span className="k"><Icon name="ticket" />Ticket</span>
            {ready.length ? <><span className="v">{ready.length}</span><span className="s">ready to claim</span></>
              : next ? <><span className="v">{fmt(next.remaining)}</span><span className="s">XP to {next.title}</span><Bar pct={next.pct} /></>
              : <><span className="v">—</span><span className="s">Add a reward</span></>}
          </button>
          <button className="mini ember" onClick={() => navigate('/ascend/quests?tab=bosses')}>
            <span className="k"><Icon name="flame" />Bosses</span>
            <span className="v">{bosses.length}</span>
            <span className="s">{bosses.length ? 'waiting to be faced' : 'none active'}</span>
          </button>
          <button className="mini" onClick={() => navigate('/ascend/stats')}>
            <span className="k"><Icon name="star" />Streak</span>
            <span className="v">{cur}<span className="faint" style={{ fontSize: 13 }}> / {best}</span></span>
            <span className="s">current / best days</span>
          </button>
        </div>

        <section className="card" aria-label="Today">
          <div className="today-head">
            <div><h2>Today</h2><div className="muted" style={{ fontSize: 13 }}>{DAYNAMES[wd]}, {fmtDate(today)}</div></div>
            {todays.length > 0 && (
              <div className="today-count">
                <div className="pips">{todays.map((q, i) => <i key={q.id} className={i < done ? 'on' : ''} />)}</div>
                <span className="num">{done} / {todays.length}</span>
              </div>
            )}
          </div>
          {todays.length === 0 ? (
            <Empty icon="list" title={`No daily quests on ${DAYNAMES[wd]}`}
              action={<button className="btn primary sm" onClick={() => openSheet({ kind: 'quest', draft: newDraft('daily', [wd]) })}><Icon name="plus" />Add a daily quest</button>}>
              Pick {ASCEND.daily.min} to {ASCEND.daily.max} non-negotiables. Small, concrete, finishable.
            </Empty>
          ) : (
            <>
              <ul className="qlist">{todays.map((q) => <TodayRow key={q.id} q={q} done={!!idx.get(q.id)?.has(today)} />)}</ul>
              <div className="today-notes">
                {sunday && (
                  <div className="note calm"><div className="grow"><strong>It's Sunday.</strong> Ten minutes for your weekly review: wins, what slipped, one focus stat, one Stoic reflection. +{ASCEND.reviewXp} XP to Reflection.
                    <div className="note-actions"><button className="btn sm" onClick={() => openSheet({ kind: 'review' })}>Start review</button></div></div></div>
                )}
                {missed && cur === 0 && (
                  <div className="note calm"><div className="grow"><strong>One missed day doesn't end the game.</strong> Your {fmt(t.total)} XP is all still here. Pick one quest and start again today.</div></div>
                )}
                {todays.length < ASCEND.daily.min && (
                  <div className="note warn"><div className="grow">Only {todays.length} daily {todays.length === 1 ? 'quest' : 'quests'} today. {ASCEND.daily.min}–{ASCEND.daily.max} keeps the day meaningful without turning it into admin.</div></div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <div className="stack">
        <section className="card" aria-label="Stats">
          <div className="card-head"><h2>Stats</h2><span className="muted">7 stats · level 1–100</span></div>
          <Radar data={data} />
          <div className="statgrid" style={{ marginTop: 12 }}>
            {data.stats.map((s) => {
              const xp = t.stat[s.id] ?? 0, li = levelInfo(xp);
              return (
                <button key={s.id} className="statcard" style={{ '--c': cvar(s.color) } as React.CSSProperties} onClick={() => navigate(`/ascend/skills?stat=${s.id}`)}>
                  <div className="row"><span className="ico">{s.icon}</span><span className="nmwrap"><span className="name">{s.name}</span><span className="lv">Level {li.level}</span></span></div>
                  <Bar pct={li.pct} />
                  <div className="sub"><span>{fmt(xp)} XP</span><span>{li.max ? 'max' : `${fmt(li.toNext)} to Lv ${li.level + 1}`}</span></div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function TodayRow({ q, done }: { q: AQuest; done: boolean }) {
  const data = useAscend((s) => s.data);
  const today = useAscend((s) => s.today);
  const complete = useAscend((s) => s.complete);
  const openSheet = useAscend((s) => s.openSheet);
  const toast = useAscend((s) => s.toast);
  const streak = currentStreak(data, today, q.id);
  return (
    <li className={`qrow${done ? ' is-done' : ''}`} style={statVar(data, q.statId)}>
      <button className="check" aria-pressed={done} aria-label={`${done ? 'Done' : 'Complete'}: ${q.title}`}
        onClick={(e) => {
          if (done) { toast('Already done today. Nice.'); return; }
          const r = e.currentTarget.getBoundingClientRect();
          void complete(q.id, { x: r.left + r.width / 2, y: r.top - 6 });
        }}><Icon name="check" /></button>
      <button className="qmain" onClick={() => openSheet({ kind: 'quest', draft: editDraft(q) })}>
        <span className="qtitle">{q.title}</span>
        <span className="qmeta"><i className="dot" />{statLabel(data, q.statId, q.subId)}{streak > 1 ? ` · ${streak} in a row` : ''}</span>
      </button>
      <span className="xp num">+{q.xp}</span>
      {q.timed && !done && (
        <button className="iconbtn sm" aria-label={`Start focus timer for ${q.title}`} onClick={() => openFocus(q.id)}><Icon name="timer" /></button>
      )}
    </li>
  );
}
