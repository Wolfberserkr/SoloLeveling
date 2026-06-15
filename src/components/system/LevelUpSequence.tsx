import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { chime, haptic } from '@/lib/feedback';
import { GlitchText } from './GlitchText';

const PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  angle: (i / 24) * Math.PI * 2,
  dist: 90 + (i % 5) * 36,
  size: 3 + (i % 3) * 2,
  delay: (i % 6) * 0.04,
}));

/**
 * Full-screen level-up takeover: dim → blue flash → LEVEL UP scale-in →
 * particle burst. Mounted once at app root; driven by uiStore.levelUp.
 */
export function LevelUpSequence() {
  const level = useUiStore((s) => s.levelUp);
  const clear = useUiStore((s) => s.clearLevelUp);

  useEffect(() => {
    if (level === null) return;
    haptic([60, 40, 120]);
    chime('levelup');
    const t = setTimeout(clear, 3400);
    return () => clearTimeout(t);
  }, [level, clear]);

  return (
    <AnimatePresence>
      {level !== null && (
        <motion.div
          key="levelup"
          className="fixed inset-0 z-[100] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={clear}
        >
          {/* dim + vignette */}
          <div className="absolute inset-0 bg-[#02030a]/90 backdrop-blur-sm" />

          {/* blue shockwave flash */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at center, rgba(78,203,255,0.55), rgba(30,58,138,0.2) 40%, transparent 70%)',
            }}
            initial={{ opacity: 0, scale: 0.2 }}
            animate={{ opacity: [0, 1, 0], scale: [0.2, 1.6, 2.2] }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
          />

          {/* particle burst */}
          {PARTICLES.map((p, i) => (
            <motion.span
              key={i}
              className="absolute rounded-full bg-accent-cyan"
              style={{ width: p.size, height: p.size, boxShadow: '0 0 8px #4ecbff' }}
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{
                x: Math.cos(p.angle) * p.dist,
                y: Math.sin(p.angle) * p.dist,
                opacity: 0,
              }}
              transition={{ duration: 1.3, delay: 0.25 + p.delay, ease: 'easeOut' }}
            />
          ))}

          {/* the announcement */}
          <motion.div
            className="relative px-10 py-8 text-center"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <div className="sys-title glitch-rgb text-sm">[ SYSTEM ]</div>
            <div className="mt-3 font-display text-5xl font-bold uppercase tracking-[0.3em] text-accent-cyan glow-text">
              <GlitchText text="Level Up" />
            </div>
            <motion.div
              className="mt-4 font-sys text-7xl font-bold text-white"
              style={{ textShadow: '0 0 30px rgba(78,203,255,0.9)' }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.4 }}
            >
              {level}
            </motion.div>
            <motion.p
              className="mt-4 font-sys text-xs uppercase tracking-widest text-accent-cyan/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
            >
              Your limits have shifted.
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
