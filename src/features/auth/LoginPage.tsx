import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { SystemWindow } from '@/components/system/SystemWindow';
import { GlitchText } from '@/components/system/GlitchText';

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [awaitConfirm, setAwaitConfirm] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: name || 'Player',
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
          },
        });
        if (error) throw error;
        // Email confirmation on: no session yet. Say so instead of silently
        // bouncing back to this page looking like a failure.
        if (!data.session) {
          setAwaitConfirm(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <motion.div
          className="mb-8 text-center"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="sys-title glitch-rgb text-xs">[ SYSTEM ]</div>
          <h1 className="mt-3 font-display text-3xl font-bold uppercase tracking-[0.25em] text-accent-cyan glow-text">
            <GlitchText text={mode === 'login' ? 'Identify Yourself' : 'Awakening'} />
          </h1>
          <p className="mt-2 font-sys text-xs uppercase tracking-widest text-slate-400">
            {mode === 'login'
              ? 'The System awaits its Player.'
              : 'You have acquired the qualifications to be a Player.'}
          </p>
        </motion.div>

        {awaitConfirm ? (
          <SystemWindow scan accent="gold">
            <p className="font-sys text-xs leading-relaxed text-slate-300">
              A confirmation link has been sent to{' '}
              <span className="text-accent-cyan">{email}</span>. Open it to complete your
              awakening, then return here and log in.
            </p>
            <button
              className="mt-4 w-full text-center font-sys text-[0.65rem] uppercase tracking-widest text-slate-400 underline-offset-4 hover:text-accent-cyan hover:underline"
              onClick={() => {
                setAwaitConfirm(false);
                setMode('login');
              }}
            >
              Back to log in
            </button>
          </SystemWindow>
        ) : (
        <SystemWindow scan>
          <form onSubmit={submit} className="flex flex-col gap-3">
            {mode === 'signup' && (
              <label className="block">
                <span className="font-sys text-[0.65rem] uppercase tracking-widest text-slate-400">
                  Player Name
                </span>
                <input
                  className="sys-input mt-1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Sung Jin-Woo"
                  autoComplete="nickname"
                />
              </label>
            )}
            <label className="block">
              <span className="font-sys text-[0.65rem] uppercase tracking-widest text-slate-400">
                Email
              </span>
              <input
                className="sys-input mt-1"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="block">
              <span className="font-sys text-[0.65rem] uppercase tracking-widest text-slate-400">
                Password
              </span>
              <input
                className="sys-input mt-1"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>

            {error && <p className="font-sys text-xs text-accent-red">{error}</p>}

            <button className="sys-btn mt-2" disabled={busy}>
              {busy ? 'Linking…' : mode === 'login' ? 'Enter the System' : 'Awaken'}
            </button>
          </form>

          <button
            className="mt-4 w-full text-center font-sys text-[0.65rem] uppercase tracking-widest text-slate-400 underline-offset-4 hover:text-accent-cyan hover:underline"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          >
            {mode === 'login' ? 'No account — begin the awakening' : 'Already a Player — log in'}
          </button>
        </SystemWindow>
        )}
      </div>
    </div>
  );
}
