import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { usePlayerStore } from '@/stores/playerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatDistance } from '@/lib/units';
import { useMilestones } from '@/features/status/NextObjectivesPanel';

const SEEN_KEY = 'system-briefing-seen';

/**
 * "The Daily Quest has arrived." — one unified morning takeover on the first
 * open of each local day: today's quest, event, due checks, fuel, streak, and
 * the nearest milestone, then a single tap into the Training page.
 */
export function DailyBriefing() {
  const { profile, training, penalty, quests, event, dueQuestions, nutrition, totals, serverToday } =
    usePlayerStore();
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);
  const [dismissed, setDismissed] = useState(false);
  const [milestone] = useMilestones(1);
  const navigate = useNavigate();

  const show =
    !dismissed &&
    profile != null &&
    training != null &&
    serverToday != null &&
    localStorage.getItem(SEEN_KEY) !== serverToday;

  // Mark seen the moment it renders — a crash or reload must not replay it.
  useEffect(() => {
    if (show && serverToday) localStorage.setItem(SEEN_KEY, serverToday);
  }, [show, serverToday]);

  if (!show) return null;

  const sideQuestsPending = quests.filter((q) => q.status === 'pending').length;
  const streak = Number(totals?.current_streak ?? 0);
  const proteinTarget = Number(nutrition?.target_g ?? profile.protein_target_g ?? 0);

  const rows: Array<{ label: string; value: string; accent?: string }> = [
    {
      label: 'Daily Quest',
      value: `${training.pushups_target} push · ${training.situps_target} sit · ${training.squats_target} squat · ${formatDistance(Number(training.run_km_target), distanceUnit)}`,
      accent: 'text-accent-cyan',
    },
    ...(training.variant !== 'standard'
      ? [{ label: 'Variant', value: training.variant.toUpperCase(), accent: 'text-accent-purple' }]
      : []),
    ...(sideQuestsPending > 0
      ? [{ label: 'Side Quests', value: `${sideQuestsPending} issued` }]
      : []),
    ...(event && event.status === 'active'
      ? [{ label: 'System Event', value: event.title, accent: 'text-accent-gold' }]
      : []),
    ...(dueQuestions.length > 0
      ? [{ label: 'Knowledge Checks', value: `${dueQuestions.length} due`, accent: 'text-accent-purple' }]
      : []),
    ...(proteinTarget > 0 ? [{ label: 'Fuel Target', value: `${proteinTarget} g protein` }] : []),
    ...(penalty && penalty.status === 'pending'
      ? [
          {
            label: 'Penalty Quest',
            value: `Redeem to restore ${penalty.streak_to_restore}-day streak`,
            accent: 'text-accent-red',
          },
        ]
      : []),
    {
      label: 'Streak',
      value: streak > 0 ? `${streak} days — hold the line` : 'Begin a new streak today',
      accent: 'text-accent-gold',
    },
    ...(milestone ? [{ label: 'Next Unlock', value: `${milestone.label} · ${milestone.detail}` }] : []),
  ];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-void/90 p-5 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="w-full max-w-sm border border-accent-cyan/40 bg-bg-base/95 p-5 shadow-[0_0_40px_rgba(56,189,248,0.15)]"
          initial={{ scale: 0.92, y: 14 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        >
          <div className="sys-title text-[0.6rem]">[ SYSTEM ]</div>
          <h2 className="mt-2 font-display text-lg font-bold uppercase tracking-[0.2em] text-accent-cyan glow-text">
            The Daily Quest has arrived
          </h2>
          <p className="mt-1 font-sys text-[0.65rem] uppercase tracking-widest text-slate-400">
            {serverToday} · briefing
          </p>

          <div className="mt-4 flex flex-col gap-2">
            {rows.map((r) => (
              <div
                key={r.label}
                className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-1"
              >
                <span className="shrink-0 font-sys text-[0.65rem] uppercase tracking-widest text-slate-400">
                  {r.label}
                </span>
                <span
                  className={`truncate text-right font-sys text-xs ${r.accent ?? 'text-white'}`}
                >
                  {r.value}
                </span>
              </div>
            ))}
          </div>

          <button
            className="sys-btn mt-5 w-full"
            onClick={() => {
              setDismissed(true);
              navigate('/training');
            }}
          >
            Begin
          </button>
          <button
            className="mt-2 w-full text-center font-sys text-[0.65rem] uppercase tracking-widest text-slate-400 hover:text-accent-cyan"
            onClick={() => setDismissed(true)}
          >
            Dismiss
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
