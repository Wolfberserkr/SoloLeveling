'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function TitleEquipButton({
  achievementKey,
  isActive,
}: {
  achievementKey: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/titles/equip', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: isActive ? null : achievementKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(`Failed (${res.status}): ${data?.error || 'unknown error'}`);
        return;
      }
      setMsg(isActive ? 'Unequipped' : 'Equipped ✓');
      // router.refresh() invalidates the RSC cache. Hard fall-through to
      // location.reload() in case any client-side state stayed stale.
      router.refresh();
      setTimeout(() => window.location.reload(), 400);
    } catch (e: any) {
      setMsg(`Error: ${e?.message || 'network failed'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={toggle}
        disabled={busy}
        className={`sys-btn !py-1 !text-[10px] w-full ${
          isActive ? 'shadow-glow-gold' : ''
        }`}
      >
        {busy ? 'SAVING…' : isActive ? 'EQUIPPED ✓ (tap to unequip)' : 'EQUIP TITLE'}
      </button>
      {msg && (
        <div className="mt-1 text-[10px] font-mono text-accent-cyan text-center">{msg}</div>
      )}
    </div>
  );
}
