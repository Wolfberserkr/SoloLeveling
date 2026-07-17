import { useEffect, useRef, useState } from 'react';
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
import { LogPastView } from './LogPastView';
import { RestTimer } from './RestTimer';

type CompleteSummary = { done: number; total: number; dayName: string; exercisesCompleted: number };
type View =
  | { name: 'plan' }
  | { name: 'day'; dayId: string }
  | { name: 'complete'; summary: CompleteSummary }
  | { name: 'progress' }
  | { name: 'session'; dateKey: string }
  | { name: 'logpast'; dateISO: string };

/** The phone's back button/gesture walks up this hierarchy one step at a
 *  time instead of leaving the app. Plan is the root: back there does
 *  nothing, so only Home or the app switcher exits. Complete goes to Plan
 *  (not back into the finished workout). */
export function parentOf(v: View): View | null {
  switch (v.name) {
    case 'plan': return null;
    case 'session': return { name: 'progress' };
    default: return { name: 'plan' };
  }
}

/** D's "Reset" home-training portal — the light workout tracker, role-routed
 *  for her account. Entirely separate from the dark System RPG. */
export function ResetApp({ userId }: { userId: string }) {
  const init = useResetStore((s) => s.init);
  const ready = useResetStore((s) => s.ready);
  const [view, setView] = useState<View>({ name: 'plan' });
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    void init(userId);
  }, [init, userId]);

  useEffect(() => {
    // Arm a sentinel history entry so pressing back fires popstate here
    // instead of leaving the app. The handler re-arms it on every pop, so
    // the trap holds no matter how many times back is pressed. (Skip the
    // push when already armed — StrictMode mounts effects twice in dev.)
    if (!window.history.state?.resetBackGuard) {
      window.history.pushState({ ...window.history.state, resetBackGuard: true }, '');
    }
    function onPop() {
      window.history.pushState({ ...window.history.state, resetBackGuard: true }, '');
      const parent = parentOf(viewRef.current);
      if (parent) {
        setView(parent);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const planActive = view.name === 'plan' || view.name === 'day' || view.name === 'complete';

  function toTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function go(v: View) { setView(v); toTop(); }

  return (
    <div className="reset-root">
      <div className="wrap">
        <header>
          <div className="brand">
            <span className="logo"><span className="mark" />Reset</span>
            <span className="tagline">Home · 7-day week</span>
          </div>
          <p className="sub">Bodyweight + 5 kg or 10 kg plate · 45–60 min · Fat loss focus</p>
          <nav>
            <button className={planActive ? 'active' : ''} onClick={() => go({ name: 'plan' })}>Plan</button>
            <button className={view.name === 'progress' || view.name === 'session' || view.name === 'logpast' ? 'active' : ''} onClick={() => go({ name: 'progress' })}>Progress</button>
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
            <ProgressView
              onOpenSession={(dateKey) => go({ name: 'session', dateKey })}
              onAddPast={(dateISO) => go({ name: 'logpast', dateISO })}
            />
          ) : view.name === 'logpast' ? (
            <LogPastView
              dateISO={view.dateISO}
              onBack={() => go({ name: 'progress' })}
              onLogged={(dateKey) => go({ name: 'session', dateKey })}
            />
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
