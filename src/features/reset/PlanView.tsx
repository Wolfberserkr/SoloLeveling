import { estimateMinutes, pickIdFor, pickOptions, pickableDays, tipForWeek, dayById } from './resetData';
import { dayCount, lastDone, trainedHistory, useResetStore } from './resetStore';
import { REGION_LABEL, daysAgoLabel, mostRecent, recoveryWarning, suggestSession } from '@/lib/sessionPick';

/** Plan tab — program-week bar, a reminder of what was trained last, and the
 *  sessions to pick from by muscle focus. Nothing is tied to a weekday: the
 *  session trained longest ago (and recovered) is marked as today's
 *  suggestion, and picking a region trained in the last 48h shows a soft
 *  warning — never a lock. Rings reset at 00:00; the calendar keeps it all. */
export function PlanView({ onOpenDay }: { onOpenDay: (dayId: string) => void }) {
  const s = useResetStore((st) => st.s);
  const bumpWeek = useResetStore((st) => st.bumpWeek);
  const [tipHead, tipBody] = tipForWeek(s.week);
  const now = Date.now();
  const opts = pickOptions();
  const history = trainedHistory(s);
  const suggested = suggestSession(opts, history, now);
  const last = mostRecent(history);
  const lastDay = last ? dayById(pickIdFor(last.id)) : undefined;

  return (
    <>
      <div className="week-bar">
        <div>
          <div className="label">Program week</div>
          <div className="week-pick">
            <button className="step" onClick={() => bumpWeek(-1)}>−</button>
            <span className="num">{s.week}</span>
            <button className="step" onClick={() => bumpWeek(1)}>+</button>
          </div>
        </div>
        <div className="week-tip">
          <b>{tipHead}.</b> <span dangerouslySetInnerHTML={{ __html: tipBody }} />
        </div>
      </div>

      <div className="last-trained">
        <div className="label">Last trained</div>
        {last && lastDay ? (
          <div className="body">
            <b>{lastDay.name}</b> · {lastDay.focus.split(' · ')[0]} · {daysAgoLabel(Date.parse(last.date), now)}
          </div>
        ) : (
          <div className="body">Nothing logged yet — start with today's suggestion.</div>
        )}
      </div>

      <div className="section-head">What are you training today?</div>
      <div className="days">
        {pickableDays().map((d) => {
          const c = dayCount(s, d.id);
          const lastRel = lastDone(s, d.id);
          const circ = 2 * Math.PI * 15;
          const off = circ * (1 - c.pct / 100);
          const isSuggested = d.id === suggested;
          const warn = recoveryWarning(opts, history, d.id, now);
          // Estimated length for the week she is actually in — the week-1
          // ramp-in and the week-5 deload are genuinely shorter sessions.
          const estMin = estimateMinutes(d, { week: s.week });
          const meta = d.kind === 'mobility' ? 'Mobility · shadow jump rope' : `${d.ex.length} exercises`;
          return (
            <button
              key={d.id}
              className={`day-card ${isSuggested ? 'suggested' : ''}`}
              onClick={() => onOpenDay(d.id)}
            >
              <div className="day-top">
                <div className="day-info">
                  <div className="day-tags">
                    <span className="day-region">{REGION_LABEL[d.region!]}</span>
                    {isSuggested && <span className="suggest-badge">Suggested today</span>}
                  </div>
                  <div className="day-name">{d.name}</div>
                  <div className="day-focus">{d.focus}</div>
                  <div className="day-meta">
                    <span>{meta}</span>
                    <span className="dot">·</span>
                    <span>≈ {estMin} min</span>
                    <span className="dot">·</span>
                    <span>{lastRel ? 'Last ' + lastRel : 'Not started'}</span>
                  </div>
                  {warn && <div className="recovery-note">{warn}</div>}
                </div>
                <div className={`ring ${c.pct === 100 ? 'complete' : ''}`}>
                  <svg width="38" height="38">
                    <circle cx="19" cy="19" r="15" fill="none" stroke="var(--line)" strokeWidth="3" />
                    <circle
                      cx="19" cy="19" r="15" fill="none"
                      stroke={c.pct === 100 ? 'var(--accent)' : 'var(--ink)'}
                      strokeWidth="3" strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset .4s var(--ease)' }}
                    />
                  </svg>
                  <span className="pct">{c.pct}%</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <p className="muted-line" style={{ paddingTop: 12 }}>
        Progress resets at midnight — anything you ticked is saved to the calendar.
      </p>
    </>
  );
}
