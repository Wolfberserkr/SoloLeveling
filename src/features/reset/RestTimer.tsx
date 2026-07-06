import { useEffect, useRef, useState } from 'react';

const PRESETS = [45, 60, 90];

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
}

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const c = new Ctx();
    [0, 0.18, 0.36].forEach((t) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g);
      g.connect(c.destination);
      o.frequency.value = 880;
      o.start(c.currentTime + t);
      g.gain.setValueAtTime(0.001, c.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, c.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + 0.16);
      o.stop(c.currentTime + t + 0.17);
    });
  } catch {
    /* audio unavailable */
  }
  if (navigator.vibrate) navigator.vibrate([200, 80, 200]);
}

/** Floating rest timer (45/60/90s) with audio + vibration, matching DWorkout. */
export function RestTimer() {
  const [open, setOpen] = useState(false);
  const [dur, setDur] = useState(60);
  const [left, setLeft] = useState(60);
  const [run, setRun] = useState(false);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!run) return;
    interval.current = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          setRun(false);
          beep();
          return 0;
        }
        return l - 1;
      });
    }, 1000);
    return () => {
      if (interval.current) clearInterval(interval.current);
    };
  }, [run]);

  function pick(s: number) {
    setDur(s);
    setLeft(s);
    setRun(false);
  }
  function toggle() {
    if (run) {
      setRun(false);
      return;
    }
    setLeft((l) => (l === 0 ? dur : l));
    setRun(true);
  }
  function reset() {
    setRun(false);
    setLeft(dur);
  }

  return (
    <>
      <button className="fab" aria-label="Rest timer" onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2 2" />
          <path d="M9 2h6" />
        </svg>
      </button>
      {open && (
        <div className="timer-panel">
          <div className={`timer-display ${left === 0 ? 'ring-now' : ''}`}>{fmt(left)}</div>
          <div className="presets">
            {PRESETS.map((s) => (
              <button key={s} className={`preset ${s === dur ? 'sel' : ''}`} onClick={() => pick(s)}>
                {s < 60 ? s + 's' : s / 60 + 'm'}
              </button>
            ))}
          </div>
          <div className="timer-controls">
            <button className="t-go" onClick={toggle}>
              {run ? 'Pause' : left === 0 ? 'Start' : left === dur ? 'Start' : 'Resume'}
            </button>
            <button className="t-reset" onClick={reset}>
              Reset
            </button>
          </div>
        </div>
      )}
    </>
  );
}
