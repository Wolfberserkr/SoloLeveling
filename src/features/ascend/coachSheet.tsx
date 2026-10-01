// "Ask the Coach" sheet — quest ideas, the next boss to face, and feedback on
// the latest weekly review. Suggestions never save themselves: each one opens
// the normal quest form, so the daily cap and your own judgement still apply.
import { useNavigate } from 'react-router-dom';
import { ASCEND, dailyCount, weekdayOf, DAYNAMES } from './logic';
import { useAscend } from './store';
import { useCoach, type CoachTab } from './coach';
import { newDraft } from './drafts';
import { Empty, Icon, fmtDate, statLabel, statVar } from './ui';

const TABS: Array<[CoachTab, string]> = [['quests', 'Plan quests'], ['boss', 'Next boss'], ['review', 'Review feedback']];

export function CoachSheet() {
  const c = useCoach();
  const data = useAscend((s) => s.data);
  const today = useAscend((s) => s.today);
  const openSheet = useAscend((s) => s.openSheet);
  const close = useAscend((s) => s.closeSheet);
  const navigate = useNavigate();
  const activeBosses = data.bosses.filter((b) => !b.defeatedAt);
  const latest = [...data.reviews].sort((a, b) => (a.localDate < b.localDate ? 1 : -1))[0];
  const pick = c.boss?.bossId ? data.bosses.find((b) => b.id === c.boss!.bossId) : null;

  return (
    <>
      <div className="sheet-head">
        <div className="grow"><div className="eyebrow">Coach · powered by Gemini</div><h2>Ask the Coach</h2></div>
        <button className="iconbtn" aria-label="Close" onClick={close}><Icon name="x" /></button>
      </div>
      <div className="form">
        <div className="seg" role="tablist" aria-label="What to ask">
          {TABS.map(([k, l]) => <button key={k} role="tab" className="seg-btn" aria-selected={c.tab === k} onClick={() => c.setTab(k)}>{l}</button>)}
        </div>

        {c.tab === 'quests' && (
          <>
            <form className="field" onSubmit={(e) => { e.preventDefault(); void c.askQuests(); }}>
              <span className="flabel">What do you want to work on?</span>
              <textarea id="coach-goal" value={c.goal} onChange={(e) => c.setGoal(e.target.value)} placeholder="e.g. Get back into Danish, or be more present at home after night shifts" style={{ minHeight: 72 }} />
              <div><button className="btn primary" type="submit" disabled={c.busy != null || c.goal.trim().length < 3}>{c.busy === 'quests' ? 'Thinking…' : <><Icon name="spark" />Suggest quests</>}</button></div>
            </form>
            {c.suggestions && c.suggestions.length > 0 && (
              <ul className="qlist">
                {c.suggestions.map((s, i) => {
                  const added = c.added.includes(i);
                  return (
                    <li key={i} className="lrow" style={statVar(data, s.statId)}>
                      <span className="dot" style={{ width: 10, height: 10 }} />
                      <div className="qmain">
                        <span className="qtitle">{s.title}</span>
                        <span className="qmeta">{s.type === 'daily' ? 'Daily' : 'Side'} · {statLabel(data, s.statId, s.subId)} · +{s.xp} XP</span>
                        {s.why && <span className="qmeta">{s.why}</span>}
                      </div>
                      <button className="btn sm" disabled={added} onClick={() => {
                        const wd = weekdayOf(today);
                        const days = s.type === 'daily' && dailyCount(data, wd) < ASCEND.daily.max ? [wd] : [];
                        c.markAdded(i);
                        openSheet({ kind: 'quest', draft: { ...newDraft(s.type, days, s.statId), title: s.title, subId: s.subId, xp: String(s.xp) } });
                      }}>{added ? 'Opened' : 'Review & add'}</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {c.tab === 'boss' && (activeBosses.length === 0 ? (
          <Empty icon="flame" title="No bosses to choose from"
            action={<button className="btn ember sm" onClick={() => openSheet({ kind: 'quest', draft: newDraft('boss') })}><Icon name="flame" />Name a boss</button>}>
            Name the thing you have been avoiding first, then ask which to face.
          </Empty>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 14 }}>The Coach weighs what matters most, what has waited longest and what you can realistically win this week, across your {activeBosses.length} active {activeBosses.length === 1 ? 'boss' : 'bosses'}.</p>
            <div><button className="btn ember" disabled={c.busy != null} onClick={() => void c.askBoss()}>{c.busy === 'boss' ? 'Thinking…' : <><Icon name="flame" />Pick my next boss</>}</button></div>
            {pick && c.boss && (
              <article className="boss" style={statVar(data, pick.statId)}>
                <div className="boss-top"><span className="flame"><Icon name="flame" /></span><div style={{ flex: 1, minWidth: 0 }}><h3>{pick.title}</h3><span className="qmeta">{statLabel(data, pick.statId, pick.subId)}</span></div></div>
                <p style={{ fontSize: 14 }}>{c.boss.reason}</p>
                {c.boss.firstStep && <p className="why"><b>First step:</b> {c.boss.firstStep}</p>}
                <div><button className="btn sm" onClick={() => { close(); navigate('/ascend/quests?tab=bosses'); }}>Go to the boss</button></div>
              </article>
            )}
          </>
        ))}

        {c.tab === 'review' && (!latest ? (
          <Empty icon="star" title="No weekly review yet"
            action={<button className="btn primary sm" onClick={() => openSheet({ kind: 'review' })}>Start weekly review</button>}>
            Do your weekly review first: wins, what slipped, one focus stat, one Stoic reflection. Then the Coach can respond to it.
          </Empty>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 14 }}>Feedback on your review for the week of {fmtDate(latest.weekStart, true)} ({DAYNAMES[weekdayOf(latest.localDate)]}).</p>
            <div><button className="btn primary" disabled={c.busy != null} onClick={() => void c.askReview()}>{c.busy === 'review' ? 'Thinking…' : <><Icon name="spark" />Get feedback</>}</button></div>
            {c.review && c.review.reviewId === latest.id && c.review.text && <div className="note calm"><div className="grow" style={{ whiteSpace: 'pre-wrap' }}>{c.review.text}</div></div>}
          </>
        ))}

        {c.error && <p className="formmsg" role="alert">{c.error}</p>}
        <p className="hint">Suggestions are ideas, not orders. Nothing is added or changed until you save it yourself.</p>
      </div>
    </>
  );
}
