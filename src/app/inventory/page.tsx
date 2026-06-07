import { redirect } from 'next/navigation';
import { getCurrentHunter } from '@/lib/auth';
import { getStats } from '@/lib/leveling';
import { AppShell } from '@/components/AppShell';
import { SystemWindow } from '@/components/SystemWindow';
import { POWER_UPS, inventory } from '@/lib/powerups';
import { titleFor } from '@/lib/achievements';
import { InventoryActions } from './InventoryActions';

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const user = await getCurrentHunter();
  if (!user) redirect('/login');
  const stats = await getStats(user.id);
  const inv = await inventory(user.id);
  const owned: Record<string, number> = {};
  inv.forEach((i) => { owned[i.def.key] = i.quantity; });

  return (
    <AppShell hunterName={user.hunter_name} rank={stats.rank} level={stats.level} title={titleFor(user.active_title)}>
      <SystemWindow title="INVENTORY · POWER-UPS" variant="gold" scan>
        <p className="text-xs font-mono text-[#a9c7e0] mb-4">
          [ Items are earned by clearing dailies, gates, and deload weeks. ]
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {POWER_UPS.map((p) => {
            const qty = owned[p.key] || 0;
            return (
              <div key={p.key} className={`p-3 border rounded-sm bg-bg-elevated/60 ${qty > 0 ? 'border-accent-gold/60 shadow-glow-gold' : 'border-accent-cyan/20 opacity-70'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 flex items-center justify-center font-bold text-accent-gold border border-accent-gold/60 rounded-sm">{p.icon}</div>
                    <div className="font-mono text-xs tracking-widest">{p.name}</div>
                  </div>
                  <div className="font-mono text-sm text-accent-gold">×{qty}</div>
                </div>
                <p className="text-xs mt-2 text-[#a9c7e0]">{p.description}</p>
                <p className="text-[11px] mt-1 text-accent-cyan font-mono">{p.effect}</p>
                <div className="mt-2">
                  <InventoryActions itemKey={p.key} quantity={qty} />
                </div>
              </div>
            );
          })}
        </div>
      </SystemWindow>
    </AppShell>
  );
}
