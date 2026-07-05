import { useEffect, useState } from 'react';

const SCRAMBLE = '!<>-_\\/[]{}—=+*^?#ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Decode-style text: characters scramble then resolve left-to-right,
 * like System text materializing.
 */
export function GlitchText({
  text,
  speed = 28,
  className = '',
}: {
  text: string;
  speed?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    // Scrambling text is exactly the kind of motion this setting exists for.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(text);
      return;
    }
    let frame = 0;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      if (now - last >= speed) {
        last = now;
        frame++;
        const resolved = Math.floor(frame / 2);
        setDisplay(
          text
            .split('')
            .map((ch, i) => {
              if (ch === ' ' || i < resolved) return ch;
              return SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)];
            })
            .join(''),
        );
        if (resolved >= text.length) return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, speed]);

  return <span className={className}>{display}</span>;
}
