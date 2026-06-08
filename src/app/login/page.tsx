import Link from 'next/link';
import { SystemWindow } from '@/components/SystemWindow';
import { loginAction } from './actions';

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <SystemWindow title="HUNTER SIGN-IN" className="w-full max-w-md">
        <p className="text-xs text-[#a9c7e0] mb-4 font-mono">[ Identifying Hunter signature. ]</p>
        <form action={loginAction} className="space-y-3">
          <label className="block">
            <span className="text-[11px] tracking-widest font-mono text-accent-cyan/80">EMAIL</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              inputMode="email"
              className="sys-input mt-1"
            />
          </label>
          <label className="block">
            <span className="text-[11px] tracking-widest font-mono text-accent-cyan/80">PASSWORD</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="sys-input mt-1"
            />
          </label>
          {searchParams.error && (
            <div className="text-xs text-accent-red font-mono">[ ERROR ] {searchParams.error}</div>
          )}
          <button type="submit" className="sys-btn w-full">CONNECT</button>
        </form>
        <div className="mt-4 text-xs text-[#a9c7e0] text-center">
          New Hunter? <Link href="/signup" className="text-accent-cyan underline">Awaken</Link>
        </div>
      </SystemWindow>
    </main>
  );
}
