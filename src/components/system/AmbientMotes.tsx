import type { CSSProperties } from 'react';

/**
 * Ambient life: slow-drifting cyan motes behind the panels, like dust in a
 * gate. Pure CSS animation (transform/opacity only) — GPU-cheap, and the
 * global prefers-reduced-motion rule stills them entirely.
 */
const MOTES = Array.from({ length: 18 }, (_, i) => {
  const seed = (i * 2654435761) % 1000;
  return {
    left: `${(seed % 100)}%`,
    top: `${(seed * 7) % 100}%`,
    size: 2 + (seed % 4),
    dur: 14 + (seed % 12),
    delay: -((seed * 3) % 20),
    dx: `${((seed % 9) - 4) * 12}px`,
    peak: 0.45 + ((seed % 4) * 0.1),
  };
});

export function AmbientMotes() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {MOTES.map((m, i) => (
        <span
          key={i}
          className="mote"
          style={
            {
              left: m.left,
              top: m.top,
              width: m.size,
              height: m.size,
              animationDuration: `${m.dur}s`,
              animationDelay: `${m.delay}s`,
              '--dx': m.dx,
              '--peak': m.peak,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
