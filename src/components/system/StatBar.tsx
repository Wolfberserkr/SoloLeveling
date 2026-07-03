import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type Props = {
  value: number;
  max: number;
  label?: string;
  sublabel?: string;
  accent?: 'cyan' | 'purple' | 'gold' | 'red' | 'green';
  height?: number;
};

/** Spring-animated resource/XP bar with glow; flashes when it fills. */
export function StatBar({ value, max, label, sublabel, accent = 'cyan', height = 10 }: Props) {
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const prev = useRef(fraction);
  const [justFilled, setJustFilled] = useState(false);

  useEffect(() => {
    if (prev.current < 1 && fraction >= 1) {
      setJustFilled(true);
      const t = setTimeout(() => setJustFilled(false), 900);
      prev.current = fraction;
      return () => clearTimeout(t);
    }
    prev.current = fraction;
  }, [fraction]);

  return (
    <div className={`sys-window-${accent}`}>
      {(label || sublabel) && (
        <div className="mb-1 flex items-baseline justify-between font-sys text-[0.68rem] uppercase tracking-widest">
          <span className="opacity-80">{label}</span>
          <span className="opacity-60">{sublabel}</span>
        </div>
      )}
      <div className="xp-bar" style={{ height }}>
        <motion.div
          className="xp-fill"
          initial={false}
          animate={{ width: `${fraction * 100}%` }}
          transition={{ type: 'spring', stiffness: 90, damping: 20 }}
        />
        {/* Crossing 100% earns a white sweep — the bar celebrates with you. */}
        <AnimatePresence>
          {justFilled && (
            <motion.div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)',
              }}
              initial={{ x: '-100%', opacity: 1 }}
              animate={{ x: '100%', opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
