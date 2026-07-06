import { useMemo } from 'react';
import { FINISH_MSGS } from './resetData';

/** Session-complete screen — stats + a direct one-liner. */
export function CompleteView({
  summary, onHome, onProgress,
}: {
  summary: { done: number; total: number; dayName: string; exercisesCompleted: number };
  onHome: () => void;
  onProgress: () => void;
}) {
  const msg = useMemo(() => FINISH_MSGS[Math.floor(Math.random() * FINISH_MSGS.length)], []);
  const pct = summary.total === 0 ? 0 : Math.round((summary.done / summary.total) * 100);

  return (
    <>
      <div className="complete-head">
        <div className="complete-check">✓</div>
        <h2>Session Complete</h2>
        <p className="complete-day">{summary.dayName}</p>
      </div>
      <div className="stats">
        <div className="stat"><div className="n">{summary.exercisesCompleted}</div><div className="l">Exercises</div></div>
        <div className="stat"><div className="n">{summary.done}</div><div className="l">Sets done</div></div>
        <div className="stat"><div className="n">{pct}%</div><div className="l">Complete</div></div>
      </div>
      <div className="complete-msg">{msg}</div>
      <button className="btn primary" style={{ width: '100%', marginBottom: 10 }} onClick={onHome}>Back to plan</button>
      <button className="btn" style={{ width: '100%' }} onClick={onProgress}>See my progress</button>
    </>
  );
}
