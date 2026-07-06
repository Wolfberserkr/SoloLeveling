import { useState } from 'react';
import { WARMUP, COOLDOWN, INJURY_FLAGS, dayById, type Exercise } from './resetData';
import { dayCount, effectiveVideo, resolvedExercise, useResetStore } from './resetStore';
import { parseVideo } from './resetVideo';
import { SwapModal } from './SwapModal';

const Check = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 13l4 4L19 7" />
  </svg>
);

function VideoBlock({ ex }: { ex: Exercise }) {
  const s = useResetStore((st) => st.s);
  const saveVideo = useResetStore((st) => st.saveVideo);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const current = effectiveVideo(s, ex);
  const src = current ? parseVideo(current) : null;
  const showForm = editing || !src;

  function save() {
    if (!parseVideo(url)) { setErr("Couldn't read that. Try a YouTube or Vimeo URL."); return; }
    saveVideo(ex.id, url.trim());
    setEditing(false);
    setErr('');
  }

  return (
    <>
      <button className="vid-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? (src ? 'Hide demo' : 'Add demo video') : src ? 'Watch demo' : 'Add demo video'}
      </button>
      {open && (
        <div className="vid-wrap open">
          {src && !editing ? (
            <>
              <div className="embed">
                <iframe
                  loading="lazy" src={src} title="Exercise demo"
                  allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"
                  allowFullScreen
                />
              </div>
              <button className="vid-edit" onClick={() => { setEditing(true); setUrl(''); }}>Change video</button>
            </>
          ) : showForm ? (
            <div className="vid-empty">
              <p>{err || 'Paste a YouTube or Vimeo link to save a demo for this exercise.'}</p>
              <div className="row">
                <input
                  type="text" placeholder="https://youtu.be/…" value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                />
                <button className="btn-sm" onClick={save}>Save</button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}

function ExerciseCard({ dayId, slotId, onSwap }: { dayId: string; slotId: string; onSwap: (slotId: string) => void }) {
  const s = useResetStore((st) => st.s);
  const toggleSet = useResetStore((st) => st.toggleSet);
  const logVal = useResetStore((st) => st.logVal);

  const e = resolvedExercise(s, dayId, slotId);
  const arr = s.progress[dayId]?.[slotId] ?? new Array(e.sets).fill(false);
  const done = arr.every(Boolean);
  const swapped = e.id !== slotId;
  const flag = INJURY_FLAGS[e.id];
  const lg = s.log[slotId] || { reps: '', weight: '' };

  return (
    <div className={`ex ${done ? 'done' : ''}`}>
      <div className="ex-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ex-name-row">
            <span className="ex-name">{e.name}</span>
            {flag && (
              <span className={`injury-chip ${flag.type}`}>
                <span className="chip-dot" />
                {flag.type === 'back' ? 'BACK' : 'ELBOW'}
              </span>
            )}
            {swapped && <span className="swap-badge">SWAPPED</span>}
          </div>
          <div className="ex-prescribe">{e.sets} × {e.reps}</div>
          <span className="ex-load">{e.load}</span>
          {flag && (
            <div className={`injury-flag ${flag.type}`}>
              <span className="flag-ico">{flag.type === 'back' ? '⚠' : '🎾'}</span>
              <span>{flag.warn}</span>
            </div>
          )}
        </div>
        <div className="ex-actions">
          <button className="swap-btn" onClick={() => onSwap(slotId)} title="Swap exercise">⇄</button>
          <span className="ex-done-badge">✓ Done</span>
        </div>
      </div>

      <div className="sets">
        {arr.map((on, si) => (
          <span key={si} className={`set ${on ? 'on' : ''}`} onClick={() => toggleSet(dayId, slotId, si)}>
            <span className="box"><Check /></span>
            Set {si + 1}
          </span>
        ))}
      </div>

      <div className="logrow">
        {e.metric === 'time' ? (
          // Timed holds (plank, wall-sit…) log a duration in seconds, no load.
          <span className="field">
            Time
            <input
              type="text" inputMode="decimal" placeholder="sec" defaultValue={lg.reps}
              onBlur={(e2) => logVal(slotId, 'reps', e2.target.value)}
            />
          </span>
        ) : (
          <>
            <span className="field">
              Reps
              <input
                type="text" inputMode="decimal" placeholder="—" defaultValue={lg.reps}
                onBlur={(e2) => logVal(slotId, 'reps', e2.target.value)}
              />
            </span>
            {/* Bodyweight moves (push-up, dead bug…) have no load — reps only. */}
            {e.metric === 'weighted' && (
              <span className="field">
                Wt
                <input
                  type="text" inputMode="decimal" placeholder="kg" defaultValue={lg.weight}
                  onBlur={(e2) => logVal(slotId, 'weight', e2.target.value)}
                />
              </span>
            )}
          </>
        )}
      </div>

      <VideoBlock ex={e} />
    </div>
  );
}

/** Day view — the workout: warm-up, exercises, cool-down, finish. */
export function DayView({
  dayId, onBack, onComplete,
}: {
  dayId: string;
  onBack: () => void;
  onComplete: (r: { done: number; total: number; dayName: string; exercisesCompleted: number }) => void;
}) {
  const s = useResetStore((st) => st.s);
  const finishSession = useResetStore((st) => st.finishSession);
  const resetDay = useResetStore((st) => st.resetDay);
  const [swapFor, setSwapFor] = useState<string | null>(null);

  const d = dayById(dayId);
  if (!d) { onBack(); return null; }
  const c = dayCount(s, dayId);

  return (
    <>
      <button className="back" onClick={onBack}>← All sessions</button>
      <div className="session-head">
        <h2>{d.name}</h2>
        <div className="focus">{d.focus} · {d.ex.length} exercises · Rest 60 sec</div>
      </div>

      <details className="accordion">
        <summary>Warm-up · 5 min <span className="ico">▾</span></summary>
        <div className="body"><ul>{WARMUP.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      </details>

      <div>
        {d.ex.map((origEx) => (
          <ExerciseCard key={origEx.id} dayId={dayId} slotId={origEx.id} onSwap={setSwapFor} />
        ))}
      </div>

      <details className="accordion" style={{ marginTop: 10 }}>
        <summary>Cool-down · 5 min <span className="ico">▾</span></summary>
        <div className="body"><ul>{COOLDOWN.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      </details>

      <div className="finish-bar">
        <button
          className="btn primary" disabled={c.done === 0}
          onClick={() => onComplete(finishSession(dayId))}
        >
          {c.done === c.total ? 'Finish & log session ✓' : `Finish & log (${c.done}/${c.total} sets)`}
        </button>
        <button className="btn" onClick={() => resetDay(dayId)}>Reset</button>
      </div>

      {swapFor && <SwapModal dayId={dayId} slotId={swapFor} onClose={() => setSwapFor(null)} />}
    </>
  );
}
