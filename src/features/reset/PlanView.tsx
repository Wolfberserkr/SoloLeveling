import { estimateMinutes, phaseLabel, pickIdFor, pickOptions, pickableDays, tipForWeek, dayById, type WeekPhase } from './resetData';
import { dayCount, lastDone, phaseOf, trainedHistory, useResetStore } from './resetStore';
import { REGION_LABEL, daysAgoLabel, mostRecent, recoveryWarning, suggestSession } from '@/lib/sessionPick';

/** The deload switch under the week bar. A block's 6th week is a deload
 *  whatever she does, so there it shows on and locked; any other week she
 *  can switch to a deload (and back) when she needs the rest early. */
function DeloadSwitch({ phase, onToggle }: { phase: WeekPhase; onToggle: () => void }) {
  const on = phase.kind === 'deload';
  const title = phase.scheduled ? 'Scheduled deload' : 'Take a deload this week';
  const sub = phase.scheduled
    ? 'Every 6th week of a block is a deload. Press + when the week is done to start a new, heavier block.'
    : on
      ? 'On for this week: half the sets, lighter weight. Press + when you are done to start a new block, or switch it off to go back to the normal week.'
      : 'Feeling run down? Switch this on for half the sets and lighter weight. The next block starts after it.';
  return (
    <div className={`deload-switch ${on ? 'on' : ''}`}>
      <div className="deload-text">
        <div className="deload-title">{title}</div>
        <div className="deload-sub">{sub}</div>
      </div>
      <button
        type="button" role="switch" aria-checked={on} aria-label={title}
        className="toggle" disabled={phase.scheduled} onClick={onToggle}
      >
        <span className="knob" />
      </button>
    </div>
  );
}

/** Plan tab — program-week bar, a reminder of what was trained last, and the
 *  sessions to pick from by muscle focus. Nothing is tied to a weekday: the
 *  session trained longest ago (and recovered) is marked as today's
 *  suggestion, and picking a region trained in the last 48h shows a soft
 *  warning — never a lock. Rings reset at 00:00; the calendar keeps it all. */
export function PlanView({ onOpenDay }: { onOpenDay: (dayId: string) => void }) {
  const s = useResetStore((st) => st.s);
  const bumpWeek = useResetStore((st) => st.bumpWeek);
  const toggleDeload = useResetStore((st) => st.toggleDeload);
  const phase = phaseOf(s);
  const deload = phase.kind === 'deload';
  const [tipHead, tipBody] = tipForWeek(phase);
  const now = Date.now();
  const opts = pickOptions();
  const history = trainedHistory(s);
  const suggested = suggestSession(opts, history, now);
  const last = mostRecent(history);
  const lastDay = last ? dayById(pickIdFor(last.id)) : undefined;

  return (
    <>
      <div className={`week-bar ${deload ? 'deload' : ''}`}>
        <div>
          <div className="label">Program week</div>
          <div className="week-pick">
            <button className="step" aria-label="Previous week" onClick={() => bumpWeek(-1)}>−</button>
            <span className="num">{phase.week}</span>
            <button className="step" aria-label="Next week" onClick={() => bumpWeek(1)}>+</button>
          </div>
          <div className="week-phase">{phaseLabel(phase)}</div>
        </div>
        <div className="week-tip">
          <b>{tipHead}.</b> <span dangerouslySetInnerHTML={{ __html: tipBody }} />
        </div>
      </div>
      <DeloadSwitch phase={phase} onToggle={toggleDeload} />

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
          // Estimated length for the phase she is actually in: the ramp-in
          // and the deload are genuinely shorter sessions.
          const estMin = estimateMinutes(d, { phase });
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
