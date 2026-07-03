import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useUiStore, type TakeoverKind } from '@/stores/uiStore';
import { chime, haptic } from '@/lib/feedback';
import { GlitchText } from './GlitchText';

type Theme = {
  hex: string;
  rgb: string;
  duration: number;
  chime: 'success' | 'levelup';
  haptic: number[];
};

const THEMES: Record<TakeoverKind, Theme> = {
  perfect: {
    hex: '#ffd166',
    rgb: '255,209,102',
    duration: 2400,
    chime: 'success',
    haptic: [40, 30, 80],
  },
  boss: {
    hex: '#ef4444',
    rgb: '239,68,68',
    duration: 3200,
    chime: 'levelup',
    haptic: [80, 40, 80, 40, 160],
  },
  arise: {
    hex: '#a855f7',
    rgb: '168,85,247',
    duration: 3200,
    chime: 'levelup',
    haptic: [60, 40, 60, 40, 120],
  },
};

const BURST = Array.from({ length: 18 }, (_, i) => ({
  angle: (i / 18) * Math.PI * 2,
  dist: 80 + (i % 4) * 34,
  size: 3 + (i % 3) * 2,
  delay: (i % 5) * 0.05,
}));

// ARISE smoke: soft blurred orbs rising from below the title.
const SMOKE = Array.from({ length: 12 }, (_, i) => ({
  x: -110 + (i * 20 + ((i * 37) % 13)),
  size: 22 + ((i * 29) % 26),
  delay: (i % 6) * 0.14,
  drift: ((i * 17) % 40) - 20,
}));

/**
 * Full-screen cinematic for the moments beyond a level-up: PERFECT CLEAR
 * (gold ring), DUNGEON CLEARED (crimson slash), ARISE (purple smoke).
 * Mounted once at app root; driven by uiStore.takeover.
 */
export function SystemTakeover() {
  const takeover = useUiStore((s) => s.takeover);
  const clear = useUiStore((s) => s.clearTakeover);
  const theme = takeover ? THEMES[takeover.kind] : null;

  useEffect(() => {
    if (!takeover || !theme) return;
    haptic(theme.haptic);
    chime(theme.chime);
    const t = setTimeout(clear, theme.duration);
    return () => clearTimeout(t);
  }, [takeover, theme, clear]);

  return (
    <AnimatePresence>
      {takeover && theme && (
        <motion.div
          key={`${takeover.kind}-${takeover.title}`}
          className="fixed inset-0 z-[99] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={clear}
        >
          <div className="absolute inset-0 bg-[#02030a]/85 backdrop-blur-sm" />

          {/* shockwave tinted by the moment */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at center, rgba(${theme.rgb},0.5), rgba(${theme.rgb},0.12) 45%, transparent 70%)`,
            }}
            initial={{ opacity: 0, scale: 0.2 }}
            animate={{ opacity: [0, 1, 0], scale: [0.2, 1.5, 2.1] }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />

          {/* boss: a blade of light slashes across the screen */}
          {takeover.kind === 'boss' && (
            <motion.div
              className="absolute left-1/2 top-1/2 h-[2px] w-[140vmax] -translate-x-1/2"
              style={{
                background: `linear-gradient(90deg, transparent, ${theme.hex}, #fff, ${theme.hex}, transparent)`,
                boxShadow: `0 0 24px ${theme.hex}`,
                rotate: -24,
              }}
              initial={{ scaleX: 0, opacity: 1 }}
              animate={{ scaleX: [0, 1, 1], opacity: [1, 1, 0] }}
              transition={{ duration: 0.9, times: [0, 0.35, 1], ease: 'easeOut' }}
            />
          )}

          {/* arise: smoke rises; otherwise a radial particle burst */}
          {takeover.kind === 'arise'
            ? SMOKE.map((p, i) => (
                <motion.span
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: p.size,
                    height: p.size,
                    marginLeft: p.x,
                    background: `radial-gradient(circle, rgba(${theme.rgb},0.55), transparent 70%)`,
                    filter: 'blur(6px)',
                  }}
                  initial={{ y: 130, opacity: 0 }}
                  animate={{ y: -150, x: p.drift, opacity: [0, 0.9, 0] }}
                  transition={{ duration: 1.9, delay: 0.15 + p.delay, ease: 'easeOut' }}
                />
              ))
            : BURST.map((p, i) => (
                <motion.span
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: p.size,
                    height: p.size,
                    background: theme.hex,
                    boxShadow: `0 0 8px ${theme.hex}`,
                  }}
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{
                    x: Math.cos(p.angle) * p.dist,
                    y: Math.sin(p.angle) * p.dist,
                    opacity: 0,
                  }}
                  transition={{ duration: 1.2, delay: 0.2 + p.delay, ease: 'easeOut' }}
                />
              ))}

          {/* the announcement */}
          <motion.div
            className="relative px-8 py-6 text-center"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.22, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <div className="sys-title glitch-rgb text-sm" style={{ color: theme.hex }}>
              [ SYSTEM ]
            </div>
            <div
              className="mt-3 font-display text-4xl font-bold uppercase tracking-[0.28em]"
              style={{ color: theme.hex, textShadow: `0 0 24px rgba(${theme.rgb},0.9)` }}
            >
              <GlitchText text={takeover.title} />
            </div>
            {takeover.subtitle && (
              <motion.p
                className="mt-4 font-sys text-sm uppercase tracking-widest text-white/85"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.4 }}
              >
                {takeover.subtitle}
              </motion.p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
