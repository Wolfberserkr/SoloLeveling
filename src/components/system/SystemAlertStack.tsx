import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useUiStore, type SystemAlert } from '@/stores/uiStore';
import { chime, haptic } from '@/lib/feedback';

const ACCENT: Record<SystemAlert['kind'], string> = {
  info: 'sys-window-cyan',
  success: 'sys-window-green',
  warning: 'sys-window-gold',
  danger: 'sys-window-red',
};

function AlertCard({ alert }: { alert: SystemAlert }) {
  const dismiss = useUiStore((s) => s.dismissAlert);

  useEffect(() => {
    chime(alert.kind);
    haptic(alert.kind === 'danger' ? [40, 30, 40] : 30);
    const t = setTimeout(() => dismiss(alert.id), 5200);
    return () => clearTimeout(t);
  }, [alert.id, alert.kind, dismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: [-6, 5, -3, 0][0], filter: 'brightness(2.5)' }}
      animate={{
        opacity: 1,
        x: [(-6 + Math.random() * 4) | 0, 4, -2, 0],
        filter: 'brightness(1)',
      }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
      transition={{ duration: 0.32 }}
      className={`sys-window ${ACCENT[alert.kind]} cursor-pointer px-4 py-3`}
      onClick={() => dismiss(alert.id)}
    >
      <div className="sys-title glitch-rgb text-[0.65rem]">[ SYSTEM ]</div>
      <div className="mt-1 font-display text-sm font-semibold uppercase tracking-wide">
        {alert.title}
      </div>
      {alert.body && <div className="mt-0.5 text-xs opacity-75">{alert.body}</div>}
    </motion.div>
  );
}

/** Global [SYSTEM] alert queue — glitches in at the top of the viewport. */
export function SystemAlertStack() {
  const alerts = useUiStore((s) => s.alerts);
  return (
    <div className="safe-top pointer-events-none fixed inset-x-0 top-0 z-[90] flex flex-col gap-2 p-3">
      <AnimatePresence>
        {alerts.map((a) => (
          <div key={a.id} className="pointer-events-auto">
            <AlertCard alert={a} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
