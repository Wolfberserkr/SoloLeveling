import { useEffect, useState } from 'react';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import './reset.css';
import { supabase } from '@/lib/supabase';
import { useResetStore } from './resetStore';
import { PlanView } from './PlanView';
import { DayView } from './DayView';
import { CompleteView } from './CompleteView';
import { ProgressView } from './ProgressView';
import { SessionDetailView } from './SessionDetailView';
import { RestTimer } from './RestTimer';

type CompleteSummary = { done: number; total: number; dayName: string; exercisesCompleted: number };
type View =
  | { name: 'plan' }
  | { name: 'day'; dayId: string }
  | { name: 'complete'; summary: CompleteSummary }
  | { name: 'progress' }
  | { name: 'session'; dateKey: string };

/** D's "Reset" home-training portal — the light workout tracker, role-routed
 *  for her account. Entirely separate from the dark System RPG. */
export function ResetApp({ userId }: { userId: string }) {
  const init = useResetStore((s) => s.init);
  const ready = useResetStore((s) => s.ready);
  const [view, setView] = useState<View>({ name: 'plan' });

  useEffect(() => {
    void init(userId);
  }, [init, userId]);

  const planActive = view.name === 'plan' || view.name === 'day' || view.name === 'complete';

  function toTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function go(v: View) { setView(v); toTop(); }

  return (
    <div className="reset-root">
      <div className="wrap">
        <header>
          <div className="brand">
            <span className="logo"><span className="mark" />Reset</span>
            <span className="tagline">Home · 4 days</span>
          </div>
          <p className="sub">Bodyweight + 5 kg or 10 kg plate · 45–60 min · Fat loss focus</p>
          <nav>
            <button className={planActive ? 'active' : ''} onClick={() => go({ name: 'plan' })}>Plan</button>
            <button className={view.name === 'progress' || view.name === 'session' ? 'active' : ''} onClick={() => go({ name: 'progress' })}>Progress</button>
          </nav>
        </header>

        <main>
          {!ready ? (
            <p className="muted-line" style={{ paddingTop: 24 }}>Loading your plan…</p>
          ) : view.name === 'plan' ? (
            <PlanView onOpenDay={(dayId) => go({ name: 'day', dayId })} />
          ) : view.name === 'day' ? (
            <DayView
              dayId={view.dayId}
              onBack={() => go({ name: 'plan' })}
              onComplete={(summary) => go({ name: 'complete', summary })}
            />
          ) : view.name === 'complete' ? (
            <CompleteView
              summary={view.summary}
              onHome={() => go({ name: 'plan' })}
              onProgress={() => go({ name: 'progress' })}
            />
          ) : view.name === 'progress' ? (
            <ProgressView onOpenSession={(dateKey) => go({ name: 'session', dateKey })} />
          ) : (
            <SessionDetailView dateKey={view.dateKey} onBack={() => go({ name: 'progress' })} />
          )}
        </main>

        <footer>
          Synced to Solo Leveling ·{' '}
          <button
            onClick={() => void supabase.auth.signOut()}
            style={{ background: 'none', border: 0, font: 'inherit', color: 'var(--ink-3)', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Sign out
          </button>
        </footer>
      </div>

      <RestTimer />
    </div>
  );
}
