import { SystemWindow } from '@/components/system/SystemWindow';
import { GlitchText } from '@/components/system/GlitchText';

/** Placeholder for systems that come online in later phases. */
export function ModuleOffline({ name, phase, hint }: { name: string; phase: number; hint: string }) {
  return (
    <SystemWindow title={name} accent="red" scan>
      <div className="py-6 text-center">
        <div className="font-display text-2xl font-bold uppercase tracking-[0.3em] text-accent-red/90 glow-text">
          <GlitchText text="Module Offline" />
        </div>
        <p className="mt-3 font-sys text-xs uppercase tracking-widest text-slate-500">
          Awaiting System expansion — Phase {phase}
        </p>
        <p className="mx-auto mt-4 max-w-xs text-sm text-slate-400">{hint}</p>
      </div>
    </SystemWindow>
  );
}
