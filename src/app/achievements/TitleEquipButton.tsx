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

  async function toggle() {
    setBusy(true);
    const res = await fetch('/api/titles/equip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: isActive ? null : achievementKey }),
    });
    if (res.ok) router.refresh();
    setBusy(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`mt-2 sys-btn !py-1 !text-[10px] w-full ${
        isActive ? 'shadow-glow-gold' : ''
      }`}
    >
      {isActive ? 'EQUIPPED ✓' : 'EQUIP TITLE'}
    </button>
  );
}
