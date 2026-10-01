import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { setPortal, type Portal } from '@/lib/portal';
import { GlitchText } from '@/components/system/GlitchText';

/** Shown once per launch after sign-in: open the System RPG or Ascend. */
export function PortalChooser({ onSystem }: { onSystem: () => void }) {
  const navigate = useNavigate();

  function choose(p: Portal) {
    setPortal(p);
    if (p === 'ascend') navigate('/ascend');
    else onSystem();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-5 px-4 py-10">
      <div className="text-center">
        <div className="sys-title text-xs">[ Player recognized ]</div>
        <h1 className="mt-2 font-display text-2xl uppercase tracking-[0.25em] text-accent-cyan glow-text">
          <GlitchText text="Choose your path" />
        </h1>
      </div>

      <motion.button
        type="button"
        onClick={() => choose('system')}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="sys-window group w-full p-5 text-left active:scale-[0.99]"
      >
        <div className="sys-title text-[0.7rem]">The System</div>
        <div className="mt-1 font-display text-2xl font-semibold uppercase tracking-[0.12em] text-white">Solo Leveling</div>
        <p className="mt-2 text-sm text-[#a9c6e0]">
          Daily Training Quest, dungeons, the Library and your shadow army. Ranks, mana and the Legacy Boss.
        </p>
        <div className="mt-4 font-sys text-xs uppercase tracking-widest text-accent-cyan">Enter the System →</div>
      </motion.button>

      <motion.button
        type="button"
        onClick={() => choose('ascend')}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        className="w-full rounded-2xl border border-white/10 bg-[#F4F5F7] p-5 text-left text-[#11141A] shadow-[0_12px_32px_rgba(0,0,0,0.35)] active:scale-[0.99]"
        style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
      >
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#151922] text-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 14l7-7 7 7" /><path d="M5 20l7-7 7 7" opacity=".45" />
            </svg>
          </span>
          <span className="text-lg font-extrabold tracking-tight">Ascend</span>
        </div>
        <p className="mt-2 text-sm text-[#566070]">
          Your life as an RPG: seven stats from Knowledge to Emotional control, quests, boss battles and Golden Tickets.
        </p>
        <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-[#151922]">Open Ascend →</div>
      </motion.button>

      <button
        type="button"
        onClick={() => { setPortal(null); void supabase.auth.signOut(); }}
        className="mx-auto mt-2 font-sys text-[0.7rem] uppercase tracking-widest text-accent-cyan/60 active:text-accent-cyan"
      >
        Sign out
      </button>
    </div>
  );
}
