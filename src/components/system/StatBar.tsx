import { motion } from 'framer-motion';

type Props = {
  value: number;
  max: number;
  label?: string;
  sublabel?: string;
  accent?: 'cyan' | 'purple' | 'gold' | 'red' | 'green';
  height?: number;
};

/** Spring-animated resource/XP bar with glow. */
export function StatBar({ value, max, label, sublabel, accent = 'cyan', height = 10 }: Props) {
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
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
      </div>
    </div>
  );
}
