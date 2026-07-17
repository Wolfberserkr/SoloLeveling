import { useState } from 'react';
import { PLAN } from './resetData';
import { useResetStore } from './resetStore';
import { SessionEditor, seedFromPlan } from './SessionEditor';

/** Log a workout in retrospect for a blank calendar day — a session that
 *  happened but never got saved. Pick which plan day it was, then adjust the
 *  pre-filled exercise list (everything starts fully done) and log it. */
export function LogPastView({
  dateISO, onBack, onLogged,
}: {
  dateISO: string;                       // YYYY-MM-DD of the picked calendar day
  onBack: () => void;
  onLogged: (dateKey: string) => void;   // opens the newly logged session
}) {
  const addSession = useResetStore((st) => st.addSession);
  const [dayId, setDayId] = useState<string | null>(null);
  const when = new Date(`${dateISO}T12:00:00`);
  const dateLabel = when.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const days = PLAN.filter((d) => d.kind !== 'rest');

  return (
    <>
      <button className="back" onClick={dayId ? () => setDayId(null) : onBack}>
        {dayId ? '← Pick a different session' : '← Calendar'}
      </button>
      <div className="session-head">
        <h2>Log a past workout</h2>
        <div className="focus">{dateLabel}</div>
      </div>

      {!dayId ? (
        <>
          <p className="edit-note">
            Nothing was saved for this day. Pick the session you did and it'll be added to the
            calendar — everything already logged stays untouched.
          </p>
          <div className="days">
            {days.map((d) => (
              <button key={d.id} className="day-card" onClick={() => setDayId(d.id)}>
                <div className="day-top">
                  <div className="day-info">
                    <div className="day-dow">{d.dow}</div>
                    <div className="day-name">{d.name}</div>
                    <div className="day-focus">{d.focus} · {d.ex.length} exercises</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="edit-note">
            Every set starts marked done — adjust anything that went differently, add reps and
            weight, then log it.
          </p>
          <SessionEditor
            key={dayId}
            dayId={dayId}
            initial={seedFromPlan(dayId, true)}
            badgeAdds
            saveLabel="Log workout"
            onSave={(exercises) => {
              const dateKey = addSession(dayId, dateISO, exercises);
              if (dateKey) onLogged(dateKey);
            }}
            onCancel={() => setDayId(null)}
          />
        </>
      )}
    </>
  );
}
