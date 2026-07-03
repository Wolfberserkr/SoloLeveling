import { AnimatePresence, motion } from 'framer-motion';
import { useState, type ReactNode } from 'react';

type Accent = 'cyan' | 'purple' | 'gold' | 'red' | 'green';

type Props = {
  title?: string;
  accent?: Accent;
  scan?: boolean;
  delay?: number;
  className?: string;
  /** Render a chevron in the header that collapses the body. Requires a title. */
  collapsible?: boolean;
  /** When collapsible, start collapsed. */
  defaultCollapsed?: boolean;
  /** Something inside needs the player: dot in the header, and while the
   * panel is collapsed, the whole window strobes in its accent color. */
  attention?: boolean;
  /** Fires when the player expands a collapsed panel (e.g. mark log read). */
  onExpand?: () => void;
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
  collapsible = false,
  defaultCollapsed = false,
  attention = false,
  onExpand,
  children,
}: Props) {
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed);
  const canCollapse = collapsible && Boolean(title);
  const strobing = attention && collapsed;

  function toggle() {
    setCollapsed((c) => {
      if (c) onExpand?.();
      return !c;
    });
  }

  return (
    <motion.section
      initial={{ opacity: 0, clipPath: 'inset(45% 0% 45% 0%)', filter: 'brightness(2.4)' }}
      animate={{ opacity: 1, clipPath: 'inset(0% 0% 0% 0%)', filter: 'brightness(1)' }}
      transition={{ duration: 0.42, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`sys-window sys-window-${accent} ${scan ? 'scan-overlay' : ''} ${strobing ? 'attn-strobe' : ''} ${className}`}
    >
      {title &&
        (canCollapse ? (
          <header className="px-4 pt-3">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2"
              aria-expanded={!collapsed}
              onClick={toggle}
            >
              <h2 className="sys-title sys-bracket flex items-center gap-2 text-xs">
                {title}
                {attention && <span className="attn-dot" aria-label="needs attention" />}
              </h2>
              <motion.span
                className="font-sys text-xs text-accent-cyan"
                animate={{ rotate: collapsed ? 0 : 180 }}
                transition={{ duration: 0.2 }}
                aria-hidden
              >
                ▾
              </motion.span>
            </button>
            <div className="sys-divider mt-2" />
          </header>
        ) : (
          <header className="px-4 pt-3">
            <h2 className="sys-title sys-bracket flex items-center gap-2 text-xs">
              {title}
              {attention && <span className="attn-dot" aria-label="needs attention" />}
            </h2>
            <div className="sys-divider mt-2" />
          </header>
        ))}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="body"
            initial={canCollapse ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
