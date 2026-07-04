import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { chime, haptic } from '@/lib/feedback';
import { pushSupported, currentSubscription, enablePush } from '@/lib/push';
import { GlitchText } from './GlitchText';
import type { SystemEvent } from '@/lib/types';

// The interrupting System window from the anime: a full-screen [!] popup
// that seizes the screen when something demands the player — an active
// System Event (gates above all) or the evening Daily Quest reminder.
// Each popup fires once per device (acknowledgements persist locally);
// the matching phone push is sent server-side by the cron heartbeat.

type Theme = {
  rgb: string;
  header: string;
  chime: 'info' | 'success' | 'warning' | 'danger';
  haptic: number[];
};

const EVENT_THEMES: Record<SystemEvent['kind'], Theme> = {
  gate: { rgb: '239,68,68', header: 'Emergency Quest', chime: 'danger', haptic: [80, 40, 80, 40, 160] },
  riddle: { rgb: '168,85,247', header: 'System Riddle', chime: 'warning', haptic: [40, 30, 80] },
  mana_surge: { rgb: '78,203,255', header: 'System Event', chime: 'info', haptic: [30, 20, 30] },
  xp_surge: { rgb: '255,209,102', header: 'System Event', chime: 'info', haptic: [30, 20, 30] },
  potion_gift: { rgb: '168,85,247', header: 'System Gift', chime: 'success', haptic: [30, 20, 30] },
};

const REMINDER_THEME: Theme = {
  rgb: '255,209,102',
  header: 'Quest Reminder',
  chime: 'warning',
  haptic: [50, 30, 50],
};

const REMINDER_TITLE = 'DAILY QUEST INCOMPLETE.';
const REMINDER_BODY =
  'The day is closing. Complete your training before midnight — the streak is the spine of everything.';

// One key per popup family, overwritten on each acknowledgement, so
// localStorage never accumulates.
const ACK_EVENT = 'system-popup-acked-event';
const ACK_REMINDER = 'system-popup-acked-reminder';

function readAck(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeAck(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // popup simply reappears next visit
  }
}

type Popup = {
  key: string;
  theme: Theme;
  title: string;
  body: string;
  /** Where the primary button leads; null renders acknowledge-only. */
  questPath: string | null;
  questLabel: string;
  ack: () => void;
};

export function SystemPopup() {
  const { event, training, profile } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const navigate = useNavigate();
  const [ackVersion, setAckVersion] = useState(0);
  const [tick, setTick] = useState(0);
  const [pushState, setPushState] = useState<'unknown' | 'off' | 'on'>('unknown');
  const [busy, setBusy] = useState(false);

  // The reminder hour can arrive while the app sits open — re-check each minute.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const popup = useMemo<Popup | null>(() => {
    void ackVersion;
    void tick;
    if (event && event.status === 'active' && readAck(ACK_EVENT) !== event.id) {
      const resolvable = event.kind === 'gate' || event.kind === 'riddle';
      return {
        key: `event:${event.id}`,
        theme: EVENT_THEMES[event.kind],
        title: event.title,
        body: event.body,
        questPath: resolvable ? '/training' : null,
        questLabel: event.kind === 'gate' ? '⚔ Enter the Gate' : '◈ Face the Riddle',
        ack: () => writeAck(ACK_EVENT, event.id),
      };
    }
    const reminderHour = profile?.reminder_hour ?? 18;
    if (
      training?.status === 'pending' &&
      new Date().getHours() >= reminderHour &&
      readAck(ACK_REMINDER) !== training.local_date
    ) {
      const date = training.local_date;
      return {
        key: `reminder:${date}`,
        theme: REMINDER_THEME,
        title: REMINDER_TITLE,
        body: REMINDER_BODY,
        questPath: '/training',
        questLabel: '⚔ Begin Training',
        ack: () => writeAck(ACK_REMINDER, date),
      };
    }
    return null;
  }, [event, training, profile, ackVersion, tick]);

  const popupKey = popup?.key;

  useEffect(() => {
    if (!popup || !popupKey) return;
    chime(popup.theme.chime);
    haptic(popup.theme.haptic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popupKey]);

  // Surface the phone-alert shortcut only where push could work but isn't on.
  useEffect(() => {
    if (!popupKey) return;
    if (!pushSupported()) {
      setPushState('unknown');
      return;
    }
    void currentSubscription().then((sub) => setPushState(sub ? 'on' : 'off'));
  }, [popupKey]);

  function dismiss(to?: string) {
    if (!popup) return;
    popup.ack();
    setAckVersion((v) => v + 1);
    if (to) navigate(to);
  }

  async function enableAlerts() {
    if (busy || !profile) return;
    setBusy(true);
    try {
      await enablePush(profile.user_id);
      setPushState('on');
      pushAlert({
        kind: 'success',
        title: 'Phone alerts on',
        body: 'Gates and reminders will reach this device the moment they trigger.',
      });
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Notification setup failed',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {popup && (
        <motion.div
          key={popup.key}
          className="fixed inset-0 z-[90] flex items-center justify-center p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ ['--color-accent-rgb' as string]: popup.theme.rgb }}
        >
          <div className="absolute inset-0 bg-[#02030a]/85 backdrop-blur-sm" onClick={() => dismiss()} />

          <motion.div
            className={`scan-overlay relative w-full max-w-sm border-2 bg-bg-base/95 p-5 ${
              popup.theme.header === 'Emergency Quest' ? 'gate-strobe' : ''
            }`}
            style={{
              borderColor: `rgba(${popup.theme.rgb},0.7)`,
              boxShadow: `0 0 40px rgba(${popup.theme.rgb},0.3)`,
            }}
            initial={{ opacity: 0, clipPath: 'inset(45% 0% 45% 0%)', filter: 'brightness(2.4)' }}
            animate={{
              opacity: 1,
              clipPath: 'inset(0% 0% 0% 0%)',
              filter: 'brightness(1)',
              transitionEnd: { clipPath: 'none', filter: 'none' },
            }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* the [ ! ] sigil */}
            <div className="flex flex-col items-center">
              <motion.div
                className="flex h-12 w-12 rotate-45 items-center justify-center border-2"
                style={{
                  borderColor: `rgb(${popup.theme.rgb})`,
                  boxShadow: `0 0 18px rgba(${popup.theme.rgb},0.6)`,
                }}
                initial={{ scale: 0, rotate: 45 }}
                animate={{ scale: 1, rotate: 45 }}
                transition={{ delay: 0.2, duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <span
                  className="-rotate-45 font-display text-2xl font-bold"
                  style={{ color: `rgb(${popup.theme.rgb})`, textShadow: `0 0 12px rgba(${popup.theme.rgb},0.9)` }}
                >
                  !
                </span>
              </motion.div>
              <div className="sys-title mt-3 text-[0.65rem]">[ SYSTEM ] · {popup.theme.header}</div>
            </div>

            <div className="sys-divider mt-3" />

            <div
              className="mt-4 text-center font-display text-xl font-bold uppercase tracking-[0.18em]"
              style={{ color: `rgb(${popup.theme.rgb})`, textShadow: `0 0 18px rgba(${popup.theme.rgb},0.7)` }}
            >
              <GlitchText text={popup.title} />
            </div>
            <p className="mt-3 whitespace-pre-line text-center text-xs leading-relaxed text-slate-300">
              {popup.body}
            </p>

            <div className="mt-5 flex flex-col gap-2">
              {popup.questPath && (
                <button className="sys-btn w-full" onClick={() => dismiss(popup.questPath!)}>
                  {popup.questLabel}
                </button>
              )}
              <button className="sys-btn sys-btn-ghost w-full" onClick={() => dismiss()}>
                Acknowledge
              </button>
            </div>

            {pushState === 'off' && (
              <button
                className="mt-3 w-full text-center font-sys text-[0.6rem] uppercase tracking-widest text-slate-500 underline decoration-slate-600 underline-offset-2"
                disabled={busy}
                onClick={enableAlerts}
              >
                {busy ? 'Linking device…' : 'Also alert my phone when these trigger'}
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
