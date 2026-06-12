import { useState } from 'react';
import { motion } from 'framer-motion';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { gameAction } from '@/lib/gameApi';
import { SystemWindow } from '@/components/system/SystemWindow';
import { GlitchText } from '@/components/system/GlitchText';
import { RIDDLE_MAX_ATTEMPTS } from '@game/riddles.ts';
import type { SystemEvent, XpAward } from '@/lib/types';

const EVENT_ACCENTS: Record<SystemEvent['kind'], 'red' | 'cyan' | 'gold' | 'purple'> = {
  gate: 'red',
  mana_surge: 'cyan',
  xp_surge: 'gold',
  potion_gift: 'purple',
  riddle: 'purple',
};

/** Today's random System Event, if one spawned. Gates and riddles resolve by hand. */
export function EventPanel() {
  const { event, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const showLevelUp = useUiStore((s) => s.showLevelUp);
  const [busy, setBusy] = useState(false);
  const [guess, setGuess] = useState('');

  if (!event || event.status === 'expired') return null;
  const cleared = event.status === 'completed';

  async function clearGate() {
    if (busy || !event || event.kind !== 'gate' || cleared) return;
    setBusy(true);
    try {
      const res = await gameAction<{ award: XpAward }>('complete-event');
      pushAlert({
        kind: 'success',
        title: 'GATE CLEARED',
        body: `+${res.award.credited} XP${res.award.capped ? ' · DAILY XP SATURATED' : ''}`,
      });
      if (res.award.leveled_up) showLevelUp(res.award.new_level);
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Gate rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function answerRiddle() {
    if (busy || !event || event.kind !== 'riddle' || cleared || !guess.trim()) return;
    setBusy(true);
    try {
      const res = await gameAction<{
        correct: boolean;
        answer: string | null;
        attempts_left?: number;
        award?: XpAward;
      }>('answer-riddle', { guess });
      if (res.correct) {
        pushAlert({
          kind: 'success',
          title: 'RIDDLE SOLVED',
          body: `+${res.award?.credited ?? event.xp_reward} XP${res.award?.capped ? ' · DAILY XP SATURATED' : ''}`,
        });
        if (res.award?.leveled_up) showLevelUp(res.award.new_level);
      } else if (res.answer) {
        pushAlert({
          kind: 'danger',
          title: 'The riddle stands unsolved',
          body: `The answer was “${res.answer}”. No XP today.`,
        });
      } else {
        pushAlert({
          kind: 'warning',
          title: 'Wrong answer',
          body: `${res.attempts_left} ${res.attempts_left === 1 ? 'attempt remains' : 'attempts remain'}. Think again.`,
        });
      }
      setGuess('');
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Answer rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  const attemptsLeft =
    (event.payload.max_attempts ?? RIDDLE_MAX_ATTEMPTS) - (event.payload.attempts_used ?? 0);

  return (
    <SystemWindow title="System Event" accent={EVENT_ACCENTS[event.kind]} scan>
      <div className="font-display text-lg font-bold uppercase tracking-[0.2em] text-white glow-text">
        <GlitchText text={event.title} />
      </div>
      <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-400">
        {event.body}
      </p>

      {(event.kind === 'gate' || event.kind === 'riddle') && cleared && (
        <motion.div
          initial={{ scale: 2, opacity: 0, rotate: -12 }}
          animate={{ scale: 1, opacity: 1, rotate: -8 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none mx-auto mt-4 w-fit border-2 border-accent-green px-6 py-1 font-display text-xl font-bold uppercase tracking-[0.3em] text-accent-green"
          style={{ boxShadow: '0 0 18px rgba(16,185,129,0.4)' }}
        >
          Cleared
        </motion.div>
      )}

      {event.kind === 'gate' && !cleared && (
        <button className="sys-btn mt-4 w-full" disabled={busy} onClick={clearGate}>
          ⚔ Report Gate Cleared (+{event.xp_reward} XP)
        </button>
      )}

      {event.kind === 'riddle' && !cleared && (
        <div className="mt-4">
          <input
            type="text"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && answerRiddle()}
            placeholder="Your answer…"
            className="w-full border border-accent-cyan/30 bg-bg-base/60 px-2 py-1 font-sys text-sm text-white outline-none focus:border-accent-cyan"
          />
          <button
            className="sys-btn mt-2 w-full"
            disabled={busy || !guess.trim()}
            onClick={answerRiddle}
          >
            ◈ Speak the Answer (+{event.xp_reward} XP)
          </button>
          <p className="mt-2 text-center font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
            {attemptsLeft} {attemptsLeft === 1 ? 'attempt' : 'attempts'} remaining
          </p>
        </div>
      )}
    </SystemWindow>
  );
}
