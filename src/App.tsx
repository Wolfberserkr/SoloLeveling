import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { todayInTz } from '@/lib/dates';
import { usePlayerStore } from '@/stores/playerStore';
import { BottomNav } from '@/components/system/BottomNav';
import { SystemErrorBoundary } from '@/components/system/ErrorBoundary';
import { DailyBriefing } from '@/components/system/DailyBriefing';
import { SystemAlertStack } from '@/components/system/SystemAlertStack';
import { OfflineBanner } from '@/components/system/OfflineBanner';
import { LevelUpSequence } from '@/components/system/LevelUpSequence';
import { SystemTakeover } from '@/components/system/SystemTakeover';
import { XpBurstLayer } from '@/components/system/XpBurstLayer';
import { AmbientMotes } from '@/components/system/AmbientMotes';
import { GlitchText } from '@/components/system/GlitchText';
import { LoginPage } from '@/features/auth/LoginPage';
import { StatusPage } from '@/features/status/StatusPage';
import { TrainingPage } from '@/features/training/TrainingPage';

// Status and Training are the daily-loop pages — keep them in the main
// bundle. Everything else loads on first visit.
const DungeonsPage = lazy(() =>
  import('@/features/dungeons/DungeonsPage').then((m) => ({ default: m.DungeonsPage })),
);
const LibraryPage = lazy(() =>
  import('@/features/library/LibraryPage').then((m) => ({ default: m.LibraryPage })),
);
const SkillsPage = lazy(() =>
  import('@/features/skills/SkillsPage').then((m) => ({ default: m.SkillsPage })),
);
const ShadowArmyPage = lazy(() =>
  import('@/features/shadows/ShadowArmyPage').then((m) => ({ default: m.ShadowArmyPage })),
);
const MorePage = lazy(() =>
  import('@/features/more/MorePage').then((m) => ({ default: m.MorePage })),
);

/** Manual re-sync — the only universal escape hatch for stale data. */
function SyncButton() {
  const loadAll = usePlayerStore((s) => s.loadAll);
  const [spinning, setSpinning] = useState(false);
  async function sync() {
    if (spinning) return;
    setSpinning(true);
    try {
      await loadAll();
    } finally {
      setSpinning(false);
    }
  }
  return (
    <button
      type="button"
      onClick={() => void sync()}
      aria-label="Re-sync with the System"
      className="fixed right-2 top-2 z-40 border border-accent-cyan/30 bg-void/70 px-2 py-1 font-sys text-[0.65rem] uppercase tracking-widest text-accent-cyan/80 backdrop-blur-sm active:text-accent-cyan"
    >
      <span className={spinning ? 'inline-block animate-spin' : ''}>⟳</span>
    </button>
  );
}

/** Shown when ensure-daily failed and we're rendering direct table reads. */
function DegradedBanner() {
  const degraded = usePlayerStore((s) => s.degraded);
  const loadAll = usePlayerStore((s) => s.loadAll);
  if (!degraded) return null;
  return (
    <button
      type="button"
      onClick={() => void loadAll()}
      className="fixed inset-x-0 top-0 z-40 bg-accent-red/20 px-3 py-1.5 text-center font-sys text-[0.65rem] uppercase tracking-widest text-accent-red"
    >
      System link degraded — showing last known state. Tap to re-establish.
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <div className="mx-auto min-h-screen max-w-lg px-3 pb-24 pt-4">
      <SyncButton />
      <DegradedBanner />
      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22 }}
        >
          {children}
        </motion.main>
      </AnimatePresence>
      <BottomNav />
    </div>
  );
}

const BOOT_LINES = [
  '> locating player signature……… found',
  '> synchronizing daily quests…',
  '> restoring mana channels…',
  '> link established',
].join('\n');

/** Terminal-style typewriter under the boot title — the System dialing in. */
function BootTicker() {
  const [chars, setChars] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setChars((c) => {
        if (c >= BOOT_LINES.length) {
          clearInterval(id);
          return c;
        }
        return c + 1;
      });
    }, 26);
    return () => clearInterval(id);
  }, []);
  return (
    <pre className="min-h-[5.5rem] w-64 whitespace-pre-wrap font-sys text-[0.65rem] leading-relaxed text-accent-cyan/70">
      {BOOT_LINES.slice(0, chars)}
      <span className="animate-flicker">▮</span>
    </pre>
  );
}

function BootScreen({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <div className="sys-title glitch-rgb animate-flicker text-sm">[ SYSTEM ]</div>
      <div className="font-display text-lg uppercase tracking-[0.3em] text-accent-cyan glow-text">
        <GlitchText text={error ? 'Link Error' : 'Establishing Link'} />
      </div>
      {error ? (
        <>
          <p className="max-w-xs text-center font-sys text-xs text-accent-red">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="border border-accent-cyan/50 px-4 py-2 font-display text-sm uppercase tracking-[0.2em] text-accent-cyan glow-text active:bg-accent-cyan/10"
            >
              Re-establish link
            </button>
          )}
        </>
      ) : (
        <BootTicker />
      )}
    </div>
  );
}

/** Re-sync when the app returns to the foreground on a new local day (or
 *  after sitting backgrounded long enough that everything may be stale). */
const FOREGROUND_STALE_MS = 10 * 60 * 1000;

function AuthedApp() {
  const { loading, error, profile, loadAll } = usePlayerStore();

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      const s = usePlayerStore.getState();
      if (s.loading || !s.profile) return;
      const dateFlipped =
        s.serverToday != null && todayInTz(s.profile.timezone) !== s.serverToday;
      const stale = s.lastLoadAt != null && Date.now() - s.lastLoadAt > FOREGROUND_STALE_MS;
      if (dateFlipped || stale || s.degraded) void s.loadAll();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (loading || !profile) {
    return <BootScreen error={error} onRetry={error ? () => void loadAll() : undefined} />;
  }

  return (
    <Shell>
      <DailyBriefing />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<StatusPage />} />
          <Route path="/training" element={<TrainingPage />} />
          <Route path="/dungeons" element={<DungeonsPage />} />
          <Route path="/books" element={<LibraryPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/army" element={<ShadowArmyPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Any sign-out (expiry, another tab, forced 401) must clear the
      // previous player's state, not just the MorePage sign-out button.
      if (event === 'SIGNED_OUT') usePlayerStore.getState().reset();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <BootScreen />;

  return (
    <BrowserRouter>
      {/* reducedMotion="user": Framer transforms obey the OS setting, matching
          the CSS media query that already stills keyframe animations. */}
      <MotionConfig reducedMotion="user">
      <SystemErrorBoundary>
      <AmbientMotes />
      <OfflineBanner />
      <SystemAlertStack />
      <LevelUpSequence />
      <SystemTakeover />
      <XpBurstLayer />
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/*" element={session ? <AuthedApp /> : <Navigate to="/login" replace />} />
      </Routes>
      </SystemErrorBoundary>
      </MotionConfig>
    </BrowserRouter>
  );
}
