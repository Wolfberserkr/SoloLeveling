import { useState } from 'react';
import { PLAN, RESERVE, dayById, exerciseById, isTimedReps, formatDuration, type Exercise } from './resetData';
import { useResetStore } from './resetStore';
import type { SessionExercise } from './resetDb';

function EditableExercise({
  e, added, onChange,
}: {
  e: SessionExercise;
  added: boolean;
  onChange: (patch: Partial<SessionExercise>) => void;
}) {
  const prescribe = e.prescribe ?? exerciseById(e.id)?.reps ?? '';
  const timed = isTimedReps(prescribe);
  return (
    <div className="detail-ex">
      <div className="detail-ex-head">
        <span className="detail-ex-name">
          {e.name}
          {added && <span className="swap-badge" style={{ marginLeft: 8 }}>ADDED</span>}
        </span>
        <span className="ed-sets">
          <button className="step" onClick={() => onChange({ sets_done: Math.max(0, e.sets_done - 1) })}>−</button>
          <span className="ed-count">{e.sets_done}/{e.sets_total}</span>
          <button className="step" onClick={() => onChange({ sets_done: Math.min(e.sets_total, e.sets_done + 1) })}>+</button>
        </span>
      </div>
      {prescribe && (
        <div className="detail-ex-meta" style={{ marginBottom: 8 }}>
          <span>Target: <b>{prescribe}</b></span>
        </div>
      )}
      <div className="logrow">
        <span className="field">
          {timed ? 'Time' : 'Reps'}
          <input
            type="text" inputMode="decimal" placeholder={timed ? 'sec' : '—'} value={e.reps}
            onChange={(ev) => onChange({ reps: ev.target.value })}
          />
        </span>
        <span className="field">
          Wt
          <input
            type="text" inputMode="decimal" placeholder="kg" value={e.weight}
            onChange={(ev) => onChange({ weight: ev.target.value })}
          />
        </span>
      </div>
    </div>
  );
}

/** Detail of one finished session — every exercise, sets, reps, weight.
 *  "Edit session" lets missed entries be filled in after the fact: adjust sets,
 *  reps, or weight, or add a forgotten exercise. Editing never deletes — the
 *  session itself and everything already logged stay intact. */
export function SessionDetailView({ dateKey, onBack }: { dateKey: string; onBack: () => void }) {
  const s = useResetStore((st) => st.s);
  const updateSession = useResetStore((st) => st.updateSession);
  const [draft, setDraft] = useState<SessionExercise[] | null>(null);
  const [addId, setAddId] = useState('');
  const sess = s.history.find((x) => x.date === dateKey);
  if (!sess) { onBack(); return null; }
  const when = new Date(sess.date);
  const editing = draft !== null;
  const origIds = new Set(sess.exercises.map((e) => e.slot_id));

  function startEdit() {
    if (!sess) return;
    if (sess.exercises.length) {
      setDraft(sess.exercises.map((e) => ({ ...e })));
      return;
    }
    // Legacy session without a per-exercise snapshot: seed rows from the day's
    // plan so the detail can be filled in retroactively.
    const d = dayById(sess.dayId);
    setDraft((d?.ex ?? []).map((ex) => ({
      id: ex.id, slot_id: ex.id, name: ex.name, focus: d?.focus ?? '',
      sets_total: ex.sets, sets_done: 0, reps: '', weight: '', prescribe: ex.reps,
    })));
  }

  // Exercises offerable in "Add": this day's plan first, then the rest of the
  // catalog — minus anything already in the draft (mobility moves exist under
  // a wed and a sat id with the same name, so dedupe the rest by name).
  const draftIds = new Set((draft ?? []).map((e) => e.slot_id));
  const fromDay = (dayById(sess.dayId)?.ex ?? []).filter((ex) => !draftIds.has(ex.id));
  const seenNames = new Set([...(draft ?? []).map((e) => e.name), ...fromDay.map((f) => f.name)]);
  const others: Exercise[] = [];
  for (const ex of [...PLAN.flatMap((d) => d.ex), ...RESERVE]) {
    if (draftIds.has(ex.id) || seenNames.has(ex.name)) continue;
    seenNames.add(ex.name);
    others.push(ex);
  }

  function addExercise() {
    if (!sess || !draft || !addId) return;
    const ex = exerciseById(addId);
    if (!ex || draft.some((e) => e.slot_id === ex.id)) return;
    setDraft([...draft, {
      id: ex.id, slot_id: ex.id, name: ex.name, focus: dayById(sess.dayId)?.focus ?? '',
      // Forgot-to-log is the common case, so an added exercise starts fully done.
      sets_total: ex.sets, sets_done: ex.sets, reps: '', weight: '', prescribe: ex.reps,
    }]);
    setAddId('');
  }

  function save() {
    if (!sess || !draft) return;
    updateSession(sess.date, draft);
    setDraft(null);
    setAddId('');
  }

  const exOption = (ex: Exercise) => (
    <option key={ex.id} value={ex.id}>{ex.name} · {ex.sets} × {ex.reps}</option>
  );

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
          {draft!.map((e, i) => (
            <EditableExercise
              key={e.slot_id}
              e={e}
              added={sess.exercises.length > 0 && !origIds.has(e.slot_id)}
              onChange={(patch) => setDraft(draft!.map((x, xi) => (xi === i ? { ...x, ...patch } : x)))}
            />
          ))}
          <div className="add-ex-row">
            <select value={addId} onChange={(e) => setAddId(e.target.value)}>
              <option value="">Add an exercise…</option>
              {fromDay.length > 0 && <optgroup label="From this day's plan">{fromDay.map(exOption)}</optgroup>}
              {others.length > 0 && <optgroup label="Other exercises">{others.map(exOption)}</optgroup>}
            </select>
            <button className="btn-sm" onClick={addExercise} disabled={!addId}>Add</button>
          </div>
          <div className="finish-bar">
            <button className="btn primary" onClick={save}>Save changes</button>
            <button className="btn" onClick={() => { setDraft(null); setAddId(''); }}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <div className="edit-bar">
            <button className="btn-sm" onClick={startEdit}>Edit session ✎</button>
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
