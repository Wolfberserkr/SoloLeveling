import { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { SystemWindow } from '@/components/system/SystemWindow';
import { StatRadar } from '@/components/system/StatRadar';
import { STAT_GROUPS, STAT_LABELS } from '@game/constants.ts';

type Props = {
  stats: Record<string, number>;
  delay?: number;
};

/**
 * The Attributes card. Fronts the nine attribute tiles; tapping it flips the
 * card horizontally (framer-motion rotateY, reduced to an instant swap by the
 * app-wide MotionConfig) to reveal a radar graph of the same stats.
 */
export function AttributesCard({ stats, delay = 0.08 }: Props) {
  const [flipped, setFlipped] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();

  // Both faces are absolutely stacked, so give the flip container an explicit
  // height matching the taller face (grid vs. square radar) to avoid a jump.
  useLayoutEffect(() => {
    const measure = () => {
      const f = frontRef.current?.offsetHeight ?? 0;
      const b = backRef.current?.offsetHeight ?? 0;
      if (f || b) setHeight(Math.max(f, b));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (frontRef.current) ro.observe(frontRef.current);
    if (backRef.current) ro.observe(backRef.current);
    return () => ro.disconnect();
  }, [stats]);

  const toggle = () => setFlipped((v) => !v);

  return (
    <SystemWindow title="Attributes" delay={delay}>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        aria-label={flipped ? 'Flip back to attribute values' : 'Flip to stats graph'}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        className="relative cursor-pointer select-none rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-accent-cyan/60"
        style={{ perspective: 1200 }}
      >
        <motion.div
          className="relative"
          style={{ transformStyle: 'preserve-3d', height }}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Front — numeric grid */}
          <div
            ref={frontRef}
            aria-hidden={flipped}
            className="left-0 top-0 w-full"
            style={{ backfaceVisibility: 'hidden', position: height ? 'absolute' : 'relative' }}
          >
            <div className="flex flex-col gap-3">
              {STAT_GROUPS.map((group, gi) => (
                <div key={group.name}>
                  <div className="mb-1 font-sys text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                    {group.name}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {group.stats.map((key, si) => (
                      <motion.div
                        key={key}
                        className="border border-accent-cyan/20 bg-bg-base/40 p-2 text-center"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + gi * 0.08 + si * 0.04 }}
                        title={STAT_LABELS[key]}
                      >
                        <div className="font-sys text-[0.65rem] uppercase tracking-widest text-accent-cyan">
                          {key}
                        </div>
                        <div className="font-sys text-lg text-white">{stats[key] ?? 10}</div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <FlipHint label="Tap for graph" />
          </div>

          {/* Back — radar graph */}
          <div
            ref={backRef}
            aria-hidden={!flipped}
            className="left-0 top-0 w-full"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              position: 'absolute',
            }}
          >
            <StatRadar stats={stats} />
            <FlipHint label="Tap for values" />
          </div>
        </motion.div>
      </div>
    </SystemWindow>
  );
}

function FlipHint({ label }: { label: string }) {
  return (
    <div className="mt-3 flex items-center justify-center gap-1 font-sys text-[0.55rem] uppercase tracking-widest text-slate-500">
      <span aria-hidden>⤢</span>
      {label}
    </div>
  );
}
