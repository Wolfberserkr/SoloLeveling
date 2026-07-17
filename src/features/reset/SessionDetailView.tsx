import { useState } from 'react';
import { exerciseById, isTimedReps, formatDuration } from './resetData';
import { useResetStore } from './resetStore';
import { SessionEditor, seedFromPlan } from './SessionEditor';

/** Detail of one finished session — every exercise, sets, reps, weight.
 *  "Edit session" lets missed entries be filled in after the fact: adjust sets,
 *  reps, or weight, or add a forgotten exercise. Editing never deletes — the
 *  session itself and everything already logged stay intact. */
export function SessionDetailView({ dateKey, onBack }: { dateKey: string; onBack: () => void }) {
  const s = useResetStore((st) => st.s);
  const updateSession = useResetStore((st) => st.updateSession);
  const [editing, setEditing] = useState(false);
  const sess = s.history.find((x) => x.date === dateKey);
  if (!sess) { onBack(); return null; }
  const when = new Date(sess.date);
  const hasSnapshot = sess.exercises.length > 0;

  return (
    <>
      <button className="back" onClick={onBack}>← Past sessions</button>
      <div className="session-head">
        <h2>{sess.name}</h2>
        <div className="focus">
          {when.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {sess.done}/{sess.total} sets
        </div>
      </div>

      {editing ? (
        <>
          <p className="edit-note">
            Fix sets, reps, or weight, or add an exercise you forgot. Saving only updates this
            session's details — nothing already logged is removed.
          </p>
          <SessionEditor
            dayId={sess.dayId}
            // A legacy session without a per-exercise snapshot seeds its rows
            // from the day's plan so the detail can be filled in retroactively.
            initial={hasSnapshot ? sess.exercises : seedFromPlan(sess.dayId, false)}
            badgeAdds={hasSnapshot}
            saveLabel="Save changes"
            onSave={(exercises) => { updateSession(sess.date, exercises); setEditing(false); }}
            onCancel={() => setEditing(false)}
          />
        </>
      ) : (
        <>
          <div className="edit-bar">
            <button className="btn-sm" onClick={() => setEditing(true)}>Edit session ✎</button>
          </div>
          {sess.exercises.length === 0 ? (
            <p className="muted-line">No detailed snapshot for this session — tap Edit to fill it in.</p>
          ) : (
            sess.exercises.map((e, i) => {
              // Timed moves (planks, wall sits, holds) record a duration, not reps.
              // Prefer the prescription snapshot; fall back to the plan for sessions
              // logged before it was stored.
              const prescribe = e.prescribe ?? exerciseById(e.id)?.reps ?? '';
              const timed = isTimedReps(prescribe);
              return (
                <div key={i} className="detail-ex">
                  <div className="detail-ex-head">
                    <span className="detail-ex-name">{e.name}</span>
                    <span className="detail-ex-sets">{e.sets_done}/{e.sets_total} sets</span>
                  </div>
                  <div className="detail-ex-meta">
                    {timed ? (
                      e.reps
                        ? <span>Time held: <b>{formatDuration(e.reps)}</b></span>
                        : prescribe
                          ? <span>Target hold: <b>{prescribe}</b></span>
                          : <span className="muted-line" style={{ padding: 0 }}>No time logged</span>
                    ) : (
                      <>
                        {e.reps && <span>Reps logged: <b>{e.reps}</b></span>}
                        {e.weight && <span>Weight: <b>{e.weight} kg</b></span>}
                        {!e.reps && !e.weight && <span className="muted-line" style={{ padding: 0 }}>No reps/weight logged</span>}
                      </>
                    )}
                    {timed && e.weight && <span>Weight: <b>{e.weight} kg</b></span>}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}
    </>
  );
}
