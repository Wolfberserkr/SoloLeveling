import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { usePlayerStore } from '@/stores/playerStore';
import { BottomNav } from '@/components/system/BottomNav';
import { SystemAlertStack } from '@/components/system/SystemAlertStack';
import { LevelUpSequence } from '@/components/system/LevelUpSequence';
import { GlitchText } from '@/components/system/GlitchText';
import { LoginPage } from '@/features/auth/LoginPage';
import { StatusPage } from '@/features/status/StatusPage';
import { TrainingPage } from '@/features/training/TrainingPage';
import { DungeonsPage } from '@/features/dungeons/DungeonsPage';
import { LibraryPage } from '@/features/library/LibraryPage';
import { MorePage } from '@/features/more/MorePage';

function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <div className="mx-auto min-h-screen max-w-lg px-3 pb-24 pt-4">
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

function BootScreen({ error }: { error?: string | null }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <div className="sys-title glitch-rgb animate-flicker text-sm">[ SYSTEM ]</div>
      <div className="font-display text-lg uppercase tracking-[0.3em] text-accent-cyan glow-text">
        <GlitchText text={error ? 'Link Error' : 'Establishing Link'} />
      </div>
      {error && <p className="max-w-xs text-center font-sys text-xs text-accent-red">{error}</p>}
    </div>
  );
}

function AuthedApp() {
  const { loading, error, profile, loadAll } = usePlayerStore();

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  if (loading || !profile) return <BootScreen error={error} />;

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<StatusPage />} />
        <Route path="/training" element={<TrainingPage />} />
        <Route path="/dungeons" element={<DungeonsPage />} />
        <Route path="/books" element={<LibraryPage />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <BootScreen />;

  return (
    <BrowserRouter>
      <SystemAlertStack />
      <LevelUpSequence />
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/*" element={session ? <AuthedApp /> : <Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
