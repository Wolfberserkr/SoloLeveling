import { AnimatePresence, motion } from 'framer-motion';
import { useUiStore } from '@/stores/uiStore';

/**
 * Floating "+N XP" numbers that rise and fade from where the reward was
 * earned. Mounted once at app root; fed by uiStore.burstXp(amount, at).
 */
export function XpBurstLayer() {
  const bursts = useUiStore((s) => s.xpBursts);
  const remove = useUiStore((s) => s.removeXpBurst);

  return (
    <div className="pointer-events-none fixed inset-0 z-[95] overflow-hidden">
      <AnimatePresence>
        {bursts.map((b) => {
          const big = b.amount >= 100;
          return (
            <motion.span
              key={b.id}
              className={`absolute font-sys font-bold ${big ? 'text-accent-gold' : 'text-accent-cyan'}`}
              style={{
                left: b.x,
                top: b.y,
                fontSize: big ? '1.4rem' : '1.05rem',
                textShadow: big
                  ? '0 0 14px rgba(255,209,102,0.9)'
                  : '0 0 12px rgba(78,203,255,0.9)',
              }}
              initial={{ opacity: 0, y: 6, x: '-50%', scale: 0.6 }}
              animate={{ opacity: [0, 1, 1, 0], y: -76, scale: [0.6, 1.2, 1, 1] }}
              transition={{ duration: 1.15, ease: 'easeOut', times: [0, 0.15, 0.75, 1] }}
              onAnimationComplete={() => remove(b.id)}
            >
              +{b.amount} XP
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
