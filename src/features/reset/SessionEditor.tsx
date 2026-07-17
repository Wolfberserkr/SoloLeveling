import { useState } from 'react';
import { PLAN, RESERVE, dayById, exerciseById, isTimedReps, type Exercise } from './resetData';
import type { SessionExercise } from './resetDb';

/** Seed an editable exercise list from a plan day. `fullyDone` marks every set
 *  complete up front — the right default when logging a workout that already
 *  happened; pass false when filling in a legacy record from scratch. */
export function seedFromPlan(dayId: string, fullyDone: boolean): SessionExercise[] {
  const d = dayById(dayId);
  return (d?.ex ?? []).map((ex) => ({
    id: ex.id, slot_id: ex.id, name: ex.name, focus: d?.focus ?? '',
    sets_total: ex.sets, sets_done: fullyDone ? ex.sets : 0, reps: '', weight: '', prescribe: ex.reps,
  }));
}

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

/** Editable exercise list shared by "edit a logged session" and "log a past
 *  workout": per-exercise set steppers, reps/weight inputs, and an
 *  add-exercise picker. Purely additive — rows can't be removed. */
export function SessionEditor({
  dayId, initial, badgeAdds, saveLabel, onSave, onCancel,
}: {
  dayId: string;                 // groups the add-picker ("this day's plan" first)
  initial: SessionExercise[];
  badgeAdds: boolean;            // mark rows beyond the initial list with ADDED
  saveLabel: string;
  onSave: (exercises: SessionExercise[]) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<SessionExercise[]>(() => initial.map((e) => ({ ...e })));
  const [addId, setAddId] = useState('');
  const initialIds = new Set(initial.map((e) => e.slot_id));

  // Exercises offerable in "Add": this day's plan first, then the rest of the
  // catalog — minus anything already in the draft (mobility moves exist under
  // a wed and a sat id with the same name, so dedupe the rest by name).
  const draftIds = new Set(draft.map((e) => e.slot_id));
  const fromDay = (dayById(dayId)?.ex ?? []).filter((ex) => !draftIds.has(ex.id));
  const seenNames = new Set([...draft.map((e) => e.name), ...fromDay.map((f) => f.name)]);
  const others: Exercise[] = [];
  for (const ex of [...PLAN.flatMap((d) => d.ex), ...RESERVE]) {
    if (draftIds.has(ex.id) || seenNames.has(ex.name)) continue;
    seenNames.add(ex.name);
    others.push(ex);
  }

  function addExercise() {
    if (!addId) return;
    const ex = exerciseById(addId);
    if (!ex || draft.some((e) => e.slot_id === ex.id)) return;
    setDraft([...draft, {
      id: ex.id, slot_id: ex.id, name: ex.name, focus: dayById(dayId)?.focus ?? '',
      // Forgot-to-log is the common case, so an added exercise starts fully done.
      sets_total: ex.sets, sets_done: ex.sets, reps: '', weight: '', prescribe: ex.reps,
    }]);
    setAddId('');
  }

  const exOption = (ex: Exercise) => (
    <option key={ex.id} value={ex.id}>{ex.name} · {ex.sets} × {ex.reps}</option>
  );

  return (
    <>
      {draft.map((e, i) => (
        <EditableExercise
          key={e.slot_id}
          e={e}
          added={badgeAdds && !initialIds.has(e.slot_id)}
          onChange={(patch) => setDraft(draft.map((x, xi) => (xi === i ? { ...x, ...patch } : x)))}
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
        <button className="btn primary" onClick={() => onSave(draft)}>{saveLabel}</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}
