import { PLAN, tipForWeek } from './resetData';
import { dayCount, lastDone, useResetStore } from './resetStore';

/** Plan tab — program-week bar + the four day cards with completion rings. */
export function PlanView({ onOpenDay }: { onOpenDay: (dayId: string) => void }) {
  const s = useResetStore((st) => st.s);
  const bumpWeek = useResetStore((st) => st.bumpWeek);
  const [tipHead, tipBody] = tipForWeek(s.week);

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

      <div className="days">
        {PLAN.map((d) => {
          const c = dayCount(s, d.id);
          const last = lastDone(s, d.id);
          const circ = 2 * Math.PI * 15;
          const off = circ * (1 - c.pct / 100);
          return (
            <button key={d.id} className="day-card" onClick={() => onOpenDay(d.id)}>
              <div className="day-top">
                <div className="day-info">
                  <div className="day-name">{d.name}</div>
                  <div className="day-focus">{d.focus}</div>
                  <div className="day-meta">
                    <span>{d.ex.length} exercises</span>
                    <span className="dot">·</span>
                    <span>{last ? 'Last ' + last : 'Not started'}</span>
                  </div>
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
    </>
  );
}
