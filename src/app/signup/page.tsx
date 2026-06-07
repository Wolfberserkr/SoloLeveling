import Link from 'next/link';
import { SystemWindow } from '@/components/SystemWindow';
import { signupAction } from './actions';

export default function SignupPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <SystemWindow title="HUNTER REGISTRATION" variant="purple" className="w-full max-w-md">
        <p className="text-xs text-[#a9c7e0] mb-4 font-mono">
          [ The System is preparing to evaluate a new Hunter. ]
        </p>
        <form action={signupAction} className="space-y-3">
          <label className="block">
            <span className="text-[11px] tracking-widest font-mono text-accent-cyan/80">HUNTER NAME</span>
            <input name="hunter_name" required minLength={2} maxLength={20} className="sys-input mt-1" placeholder="Sung Jin-Woo" />
          </label>
          <label className="block">
            <span className="text-[11px] tracking-widest font-mono text-accent-cyan/80">EMAIL</span>
            <input type="email" name="email" required className="sys-input mt-1" />
          </label>
          <label className="block">
            <span className="text-[11px] tracking-widest font-mono text-accent-cyan/80">PASSWORD</span>
            <input type="password" name="password" required minLength={8} className="sys-input mt-1" />
          </label>
          {searchParams.error && (
            <div className="text-xs text-accent-red font-mono">[ ERROR ] {searchParams.error}</div>
          )}
          <button type="submit" className="sys-btn w-full">AWAKEN</button>
        </form>
        <div className="mt-4 text-xs text-[#a9c7e0] text-center">
          Already a Hunter? <Link href="/login" className="text-accent-cyan underline">Sign in</Link>
        </div>
      </SystemWindow>
    </main>
  );
}
