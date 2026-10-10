import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { SystemErrorBoundary } from '@/components/system/ErrorBoundary';
import { GlitchText } from '@/components/system/GlitchText';
import { isResetAccount } from '@/features/reset/resetAccounts';
import { getPortal, setPortal } from '@/lib/portal';
import { PortalChooser } from '@/features/portal/PortalChooser';
import { LoginPage } from '@/features/auth/LoginPage';

// D's Reset portal — lazy so it never weighs on the main bundle.
const ResetApp = lazy(() =>
  import('@/features/reset/ResetApp').then((m) => ({ default: m.ResetApp })),
);
// Project Viking — the 52-week training plan (the System side of the site).
const VikingApp = lazy(() =>
  import('@/features/viking/VikingApp').then((m) => ({ default: m.VikingApp })),
);
// Ascend (the life RPG) — lazy, its own light theme and data; it only shares sign-in.
const AscendApp = lazy(() =>
  import('@/features/ascend/AscendApp').then((m) => ({ default: m.AscendApp })),
);

function BootScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <div className="sys-title glitch-rgb animate-flicker text-sm">[ SYSTEM ]</div>
      <div className="font-display text-lg uppercase tracking-[0.3em] text-accent-cyan glow-text">
        <GlitchText text="Establishing Link" />
      </div>
    </div>
  );
}

/** After sign-in: the chooser first (once per launch), then Project Viking. */
function MainGate({ userId }: { userId: string }) {
  const [portal, setLocalPortal] = useState(getPortal());
  if (portal === 'viking') {
    return (
      <Suspense fallback={<BootScreen />}>
        <VikingApp userId={userId} />
      </Suspense>
    );
  }
  return <PortalChooser onViking={() => setLocalPortal('viking')} />;
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
      // next sign-in starts at the Viking / Ascend chooser
      if (event === 'SIGNED_OUT') setPortal(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <BootScreen />;

  // Reset-portal accounts (D) get an entirely separate light-themed workout
  // app — the chooser, Viking and Ascend never mount for them.
  const reset = session != null && isResetAccount(session.user.email);

  return (
    <BrowserRouter>
      {/* reducedMotion="user": Framer transforms obey the OS setting, matching
          the CSS media query that already stills keyframe animations. */}
      <MotionConfig reducedMotion="user">
      <SystemErrorBoundary>
      {reset ? (
        <Suspense fallback={<BootScreen />}>
          <Routes>
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/*" element={<ResetApp userId={session!.user.id} />} />
          </Routes>
        </Suspense>
      ) : (
        <Routes>
          <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
          <Route
            path="/ascend/*"
            element={
              session ? (
                <Suspense fallback={<BootScreen />}>
                  <AscendApp userId={session.user.id} />
                </Suspense>
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/*"
            element={session ? <MainGate key={session.user.id} userId={session.user.id} /> : <Navigate to="/login" replace />}
          />
        </Routes>
      )}
      </SystemErrorBoundary>
      </MotionConfig>
    </BrowserRouter>
  );
}
