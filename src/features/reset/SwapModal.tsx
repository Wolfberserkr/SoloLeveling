import { exerciseById, INJURY_FLAGS, SWAPS } from './resetData';
import { resolvedExercise, useResetStore } from './resetStore';

/** Swap-exercise modal — pick a safer/different alternative for a slot. */
export function SwapModal({ dayId, slotId, onClose }: { dayId: string; slotId: string; onClose: () => void }) {
  const s = useResetStore((st) => st.s);
  const confirmSwap = useResetStore((st) => st.confirmSwap);
  const restoreSwap = useResetStore((st) => st.restoreSwap);

  const currentEx = resolvedExercise(s, dayId, slotId);
  const baseEx = exerciseById(slotId)!;
  const alts = SWAPS[currentEx.id] || [];

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-title">Swap exercise</div>
        <div className="modal-sub">Replacing: {currentEx.name}</div>
        {alts.length === 0 && (
          <p style={{ color: 'var(--ink-3)', fontSize: 13, padding: '8px 0' }}>No alternatives configured.</p>
        )}
        {alts.map((altId) => {
          const ex = exerciseById(altId);
          if (!ex) return null;
          const flag = INJURY_FLAGS[altId];
          return (
            <div
              key={altId}
              className="swap-option"
              onClick={() => { confirmSwap(dayId, slotId, altId); onClose(); }}
            >
              <div className="so-info">
                <div className="so-name">
                  {ex.name}
                  {flag && <span className={`swap-caution ${flag.type}`}>{flag.type} caution</span>}
                </div>
                <div className="so-load">{ex.sets}×{ex.reps} · {ex.load}</div>
              </div>
              <span className="so-arrow">→</span>
            </div>
          );
        })}
        {currentEx.id !== baseEx.id && (
          <button className="modal-cancel" onClick={() => { restoreSwap(dayId, slotId); onClose(); }}>
            Restore {baseEx.name}
          </button>
        )}
        <button className="modal-cancel" onClick={onClose}>Keep current</button>
      </div>
    </div>
  );
}
