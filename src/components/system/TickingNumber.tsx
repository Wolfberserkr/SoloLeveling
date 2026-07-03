import { useEffect, useRef, useState } from 'react';
import { animate } from 'framer-motion';

/**
 * A number that counts to its new value instead of snapping — XP totals,
 * protein grams, streaks. Renders plain text; animation is state-driven.
 */
export function TickingNumber({
  value,
  digits = 0,
  duration = 0.7,
}: {
  value: number;
  digits?: number;
  duration?: number;
}) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current === value) return;
    const controls = animate(prev.current, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration]);

  return <>{display.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}</>;
}
