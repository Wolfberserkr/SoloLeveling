import { useUiStore } from '@/stores/uiStore';

/**
 * Public preview of the cinematic overlays — no auth, no real XP. Lets you QA
 * the level-up / rank-up takeovers and the queue without grinding to a threshold.
 */
export function DemoPage() {
  const showLevelUp = useUiStore((s) => s.showLevelUp);
  const showRankUp = useUiStore((s) => s.showRankUp);

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6">
      <div className="sys-title glitch-rgb text-sm">[ SYSTEM ]</div>
      <h1 className="font-display text-2xl font-bold uppercase tracking-[0.3em] text-accent-cyan glow-text">
        Cinematic Demo
      </h1>
      <p className="max-w-xs text-center font-sys text-xs uppercase tracking-widest text-slate-500">
        Preview the full-screen takeovers. Tap a button, then tap the overlay (or wait) to dismiss.
      </p>
      <div className="mt-2 flex w-full flex-col gap-3">
        <button className="sys-btn w-full" onClick={() => showLevelUp(13)}>
          ◈ Level Up
        </button>
        <button className="sys-btn w-full" onClick={() => showRankUp('C')}>
          ♛ Rank Up
        </button>
        <button
          className="sys-btn sys-btn-ghost w-full"
          onClick={() => {
            showLevelUp(26);
            showRankUp('S');
          }}
        >
          Both (queued)
        </button>
      </div>
    </div>
  );
}
