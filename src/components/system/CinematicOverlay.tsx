import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { usePlayerStore } from '@/stores/playerStore';
import { RANKS, RANK_TITLES, type Rank } from '@game/constants.ts';
import { RankBadge } from './RankBadge';
import { GlitchText } from './GlitchText';

const PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  angle: (i / 24) * Math.PI * 2,
  dist: 90 + (i % 5) * 36,
  size: 3 + (i % 3) * 2,
  delay: (i % 6) * 0.04,
}));

// Per-variant palette: level-ups read cyan, rank-ups read purple/gold.
const THEME = {
  level: { particle: 'bg-accent-cyan', glow: '#4ecbff', text: 'text-accent-cyan' },
  rank: { particle: 'bg-accent-purple', glow: '#a855f7', text: 'text-accent-purple' },
} as const;

/**
 * Full-screen cinematic takeover, mounted once at app root. Driven by the
 * uiStore cinematic queue: level-ups are enqueued by action handlers via
 * showLevelUp; rank-ups are detected here by watching profile.rank so any
 * action that crosses a threshold triggers the reveal. Queued takeovers play
 * sequentially; each auto-dismisses or advances on tap.
 */
export function CinematicOverlay() {
  const current = useUiStore((s) => s.cinematics[0]);
  const advance = useUiStore((s) => s.advanceCinematic);
  const showRankUp = useUiStore((s) => s.showRankUp);
  const rank = usePlayerStore((s) => s.profile?.rank);
  const prevRank = useRef<string | undefined>(undefined);

  // Watch rank: fire a rank-up cinematic when it climbs (never on first load).
  useEffect(() => {
    if (!rank) return;
    if (prevRank.current && RANKS.indexOf(rank as Rank) > RANKS.indexOf(prevRank.current as Rank)) {
      showRankUp(rank);
    }
    prevRank.current = rank;
  }, [rank, showRankUp]);

  // Drive the queue: each takeover holds the screen, then advances.
  useEffect(() => {
    if (!current) return;
    if ('vibrate' in navigator) {
      navigator.vibrate(current.kind === 'rank' ? [80, 40, 80, 40, 160] : [60, 40, 120]);
    }
    const t = setTimeout(advance, current.kind === 'rank' ? 4000 : 3400);
    return () => clearTimeout(t);
  }, [current, advance]);

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          className="fixed inset-0 z-[100] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={advance}
        >
          <div className="absolute inset-0 bg-[#02030a]/90 backdrop-blur-sm" />

          {/* shockwave flash, tinted to the variant */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                current.kind === 'rank'
                  ? 'radial-gradient(circle at center, rgba(168,85,247,0.55), rgba(88,28,135,0.2) 40%, transparent 70%)'
                  : 'radial-gradient(circle at center, rgba(78,203,255,0.55), rgba(30,58,138,0.2) 40%, transparent 70%)',
            }}
            initial={{ opacity: 0, scale: 0.2 }}
            animate={{ opacity: [0, 1, 0], scale: [0.2, 1.6, 2.2] }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
          />

          {/* particle burst */}
          {PARTICLES.map((p, i) => (
            <motion.span
              key={i}
              className={`absolute rounded-full ${THEME[current.kind].particle}`}
              style={{ width: p.size, height: p.size, boxShadow: `0 0 8px ${THEME[current.kind].glow}` }}
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{ x: Math.cos(p.angle) * p.dist, y: Math.sin(p.angle) * p.dist, opacity: 0 }}
              transition={{ duration: 1.3, delay: 0.25 + p.delay, ease: 'easeOut' }}
            />
          ))}

          {current.kind === 'level' ? (
            <LevelPanel level={current.level} />
          ) : (
            <RankPanel rank={current.rank} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LevelPanel({ level }: { level: number }) {
  return (
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
  );
}

function RankPanel({ rank }: { rank: string }) {
  return (
    <motion.div
      className="relative px-10 py-8 text-center"
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.3, duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <div className="sys-title glitch-rgb text-sm">[ SYSTEM ]</div>
      <div className="mt-3 font-display text-5xl font-bold uppercase tracking-[0.3em] text-accent-purple glow-text">
        <GlitchText text="Rank Up" />
      </div>
      <motion.div
        className="mt-5 flex justify-center"
        initial={{ opacity: 0, scale: 0.4, rotate: -12 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ delay: 0.8, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <RankBadge rank={rank} size={84} />
      </motion.div>
      <motion.p
        className="mt-4 font-sys text-sm uppercase tracking-[0.3em] text-white"
        style={{ textShadow: '0 0 20px rgba(168,85,247,0.9)' }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.4 }}
      >
        {rank}-Rank · {RANK_TITLES[rank as Rank] ?? ''}
      </motion.p>
      <motion.p
        className="mt-2 font-sys text-xs uppercase tracking-widest text-accent-purple/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6 }}
      >
        The System reclassifies you.
      </motion.p>
    </motion.div>
  );
}
