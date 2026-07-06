import { exerciseById } from './resetData';
import { useResetStore } from './resetStore';

/** Read-only detail of one finished session — every exercise, sets, reps, weight. */
export function SessionDetailView({ dateKey, onBack }: { dateKey: string; onBack: () => void }) {
  const s = useResetStore((st) => st.s);
  const sess = s.history.find((x) => x.date === dateKey);
  if (!sess) { onBack(); return null; }
  const when = new Date(sess.date);

  return (
    <>
      <button className="back" onClick={onBack}>← Past sessions</button>
      <div className="session-head">
        <h2>{sess.name}</h2>
        <div className="focus">
          {when.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {sess.done}/{sess.total} sets
        </div>
      </div>
      {sess.exercises.length === 0 ? (
        <p className="muted-line">No detailed snapshot for this session.</p>
      ) : (
        sess.exercises.map((e, i) => {
          const metric = exerciseById(e.id)?.metric ?? 'weighted';
          return (
            <div key={i} className="detail-ex">
              <div className="detail-ex-head">
                <span className="detail-ex-name">{e.name}</span>
                <span className="detail-ex-sets">{e.sets_done}/{e.sets_total} sets</span>
              </div>
              <div className="detail-ex-meta">
                {metric === 'time'
                  ? e.reps && <span>Held: <b>{e.reps} sec</b></span>
                  : e.reps && <span>Reps logged: <b>{e.reps}</b></span>}
                {metric === 'weighted' && e.weight && <span>Weight: <b>{e.weight} kg</b></span>}
                {!e.reps && !e.weight && (
                  <span className="muted-line" style={{ padding: 0 }}>No detail logged</span>
                )}
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
