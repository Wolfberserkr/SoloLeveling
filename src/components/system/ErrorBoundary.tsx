import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Last line of defense: a render-time throw (malformed row, unexpected
 * payload shape) must show a recovery screen, never a blank white page.
 */
export class SystemErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('SystemErrorBoundary caught:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <div className="sys-title glitch-rgb animate-flicker text-sm">[ SYSTEM ]</div>
        <div className="font-display text-lg uppercase tracking-[0.3em] text-accent-red">
          System Fault
        </div>
        <p className="max-w-xs text-center font-sys text-xs text-slate-400">
          An unexpected anomaly interrupted the render. Your progress is stored server-side and
          is safe.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="border border-accent-cyan/50 px-4 py-2 font-display text-sm uppercase tracking-[0.2em] text-accent-cyan glow-text active:bg-accent-cyan/10"
        >
          Re-enter the System
        </button>
      </div>
    );
  }
}
