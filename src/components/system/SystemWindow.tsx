import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

type Accent = 'cyan' | 'purple' | 'gold' | 'red' | 'green';

type Props = {
  title?: string;
  accent?: Accent;
  scan?: boolean;
  delay?: number;
  className?: string;
  children: ReactNode;
};

/**
 * The holographic System panel. Materializes like the anime windows:
 * a vertical clip-wipe with a brightness flash, then the corner brackets
 * settle into place.
 */
export function SystemWindow({
  title,
  accent = 'cyan',
  scan = false,
  delay = 0,
  className = '',
  children,
}: Props) {
  return (
    <motion.section
      initial={{ opacity: 0, clipPath: 'inset(45% 0% 45% 0%)', filter: 'brightness(2.4)' }}
      animate={{ opacity: 1, clipPath: 'inset(0% 0% 0% 0%)', filter: 'brightness(1)' }}
      transition={{ duration: 0.42, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`sys-window sys-window-${accent} ${scan ? 'scan-overlay' : ''} ${className}`}
    >
      {title && (
        <header className="px-4 pt-3">
          <h2 className="sys-title sys-bracket text-xs">{title}</h2>
          <div className="sys-divider mt-2" />
        </header>
      )}
      <div className="p-4">{children}</div>
    </motion.section>
  );
}
