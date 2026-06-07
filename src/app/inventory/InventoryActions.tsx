'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function InventoryActions({ itemKey, quantity }: { itemKey: string; quantity: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [target, setTarget] = useState('str');

  async function use() {
    setBusy(true);
    const res = await fetch('/api/inventory/use', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: itemKey, target: itemKey === 'shadow_extraction' ? target : undefined }),
    });
    const j = await res.json();
    setMsg(j.message || (j.ok ? 'Done.' : 'Failed.'));
    if (j.ok) router.refresh();
    setBusy(false);
    setTimeout(() => setMsg(null), 3000);
  }

  if (quantity <= 0) {
    return <div className="text-[11px] text-[#465e7a] font-mono">[ NOT IN INVENTORY ]</div>;
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {itemKey === 'shadow_extraction' && (
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="sys-input !py-1 !text-[11px] !w-auto"
        >
          <option value="str">STR</option>
          <option value="agi">AGI</option>
          <option value="vit">VIT</option>
          <option value="int_">INT</option>
          <option value="per">PER</option>
        </select>
      )}
      <button onClick={use} disabled={busy} className="sys-btn !py-1 !text-[10px]">
        {busy ? 'USING…' : 'USE'}
      </button>
      {msg && <span className="text-[10px] font-mono text-accent-cyan">{msg}</span>}
    </div>
  );
}
