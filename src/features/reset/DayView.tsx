import { useState } from 'react';
import { LYMPH_VIDEO, COOLDOWN, MOBILITY, REST_TIPS, INJURY_FLAGS, dayById, type Exercise } from './resetData';
import { dayCount, effectiveVideo, lastDone, resolvedExercise, useResetStore } from './resetStore';
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
        <span className="field">
          Reps
          <input
            type="text" inputMode="decimal" placeholder="—" defaultValue={lg.reps}
            onBlur={(e2) => logVal(slotId, 'reps', e2.target.value)}
          />
        </span>
        <span className="field">
          Wt
          <input
            type="text" inputMode="decimal" placeholder="kg" defaultValue={lg.weight}
            onBlur={(e2) => logVal(slotId, 'weight', e2.target.value)}
          />
        </span>
      </div>

      <VideoBlock ex={e} />
    </div>
  );
}

/** Embeddable video slot for exercise-less days (mobility). Stores the URL in
 *  the shared `videos` map keyed by the day id — same UX as VideoBlock. */
function DayVideoSlot({ dayId }: { dayId: string }) {
  const s = useResetStore((st) => st.s);
  const saveVideo = useResetStore((st) => st.saveVideo);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const current = (s.videos[dayId] || '').trim();
  const src = current ? parseVideo(current) : null;

  function save() {
    if (!parseVideo(url)) { setErr("Couldn't read that. Try a YouTube or Vimeo URL."); return; }
    saveVideo(dayId, url.trim());
    setEditing(false);
    setErr('');
  }

  return (
    <div className="vid-wrap open" style={{ marginTop: 0 }}>
      {src && !editing ? (
        <>
          <div className="embed">
            <iframe
              loading="lazy" src={src} title="Session demo"
              allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"
              allowFullScreen
            />
          </div>
          <button className="vid-edit" onClick={() => { setEditing(true); setUrl(''); }}>Change video</button>
        </>
      ) : (
        <div className="vid-empty">
          <p>{err || 'Paste a YouTube or Vimeo link to save a demo for this day.'}</p>
          <div className="row">
            <input
              type="text" placeholder="https://youtu.be/…" value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            />
            <button className="btn-sm" onClick={save}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Mobility & shadow-jump-rope day — checklist, an optional video slot, and a
 *  single "mark done" action (no per-set tracking). */
function MobilityDay({
  dayId, onBack, onComplete,
}: {
  dayId: string;
  onBack: () => void;
  onComplete: (r: { done: number; total: number; dayName: string; exercisesCompleted: number }) => void;
}) {
  const completeSimpleDay = useResetStore((st) => st.completeSimpleDay);
  const s = useResetStore((st) => st.s);
  const d = dayById(dayId)!;
  const done = lastDone(s, dayId);

  return (
    <>
      <button className="back" onClick={onBack}>← All sessions</button>
      <div className="session-head">
        <h2>{d.name}</h2>
        <div className="focus">{d.focus} · {done ? 'Last ' + done : 'Not started'}</div>
      </div>

      <details className="accordion" open>
        <summary>The flow <span className="ico">▾</span></summary>
        <div className="body"><ul>{MOBILITY.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      </details>

      <details className="accordion">
        <summary>Demo video <span className="ico">▾</span></summary>
        <div className="body"><DayVideoSlot dayId={dayId} /></div>
      </details>

      <div className="finish-bar">
        <button className="btn primary" onClick={() => onComplete(completeSimpleDay(dayId))}>
          Mark day complete ✓
        </button>
      </div>
    </>
  );
}

/** Full rest day — recovery suggestions only, nothing to log. */
function RestDay({ dayId, onBack }: { dayId: string; onBack: () => void }) {
  const d = dayById(dayId)!;
  return (
    <>
      <button className="back" onClick={onBack}>← All sessions</button>
      <div className="session-head">
        <h2>{d.name}</h2>
        <div className="focus">{d.focus} · nothing to log</div>
      </div>

      <details className="accordion" open>
        <summary>Recover well <span className="ico">▾</span></summary>
        <div className="body"><ul>{REST_TIPS.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      </details>

      <p className="muted-line" style={{ paddingTop: 8 }}>Enjoy the rest — you earned it.</p>
    </>
  );
}

/** Day view — the workout: lymphatic drainage, exercises, cool-down, finish. */
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
  if (d.kind === 'mobility') return <MobilityDay dayId={dayId} onBack={onBack} onComplete={onComplete} />;
  if (d.kind === 'rest') return <RestDay dayId={dayId} onBack={onBack} />;
  const c = dayCount(s, dayId);

  return (
    <>
      <button className="back" onClick={onBack}>← All sessions</button>
      <div className="session-head">
        <h2>{d.name}</h2>
        <div className="focus">{d.focus} · {d.ex.length} exercises · Rest 60 sec</div>
      </div>

      <details className="accordion">
        <summary>Lymphatic drainage <span className="ico">▾</span></summary>
        <div className="body">
          <div className="embed">
            <iframe
              loading="lazy" src={parseVideo(LYMPH_VIDEO) ?? undefined} title="Lymphatic drainage"
              allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
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
