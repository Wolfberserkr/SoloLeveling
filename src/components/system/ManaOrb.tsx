import { motion } from 'framer-motion';

type Props = {
  mana: number;
  manaMax: number;
  size?: number;
};

/** Radial mana gauge. Flickers red when critically low. */
export function ManaOrb({ mana, manaMax, size = 72 }: Props) {
  const fraction = manaMax > 0 ? Math.max(0, Math.min(1, mana / manaMax)) : 0;
  const low = fraction < 0.2;
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const color = low ? '#ef4444' : '#3b82f6';

  return (
    <div
      className={`relative inline-flex items-center justify-center ${low ? 'animate-flicker' : ''}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="rgba(5,6,13,0.8)"
          stroke="rgba(59,130,246,0.2)"
          strokeWidth={4}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: circumference * (1 - fraction) }}
          transition={{ type: 'spring', stiffness: 70, damping: 18 }}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      {/* Slow specular sweep — energy, not a static gauge. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          inset: 4,
          background:
            'conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.12) 34deg, transparent 72deg)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center font-sys">
        <span className="text-sm font-bold" style={{ color }}>
          {mana}
        </span>
        <span className="text-[0.55rem] uppercase tracking-widest opacity-60">Mana</span>
      </div>
    </div>
  );
}
