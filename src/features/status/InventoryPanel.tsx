import { useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { gameAction } from '@/lib/gameApi';
import { SystemWindow } from '@/components/system/SystemWindow';
import { itemDef } from '@game/items.ts';
import type { XpAward } from '@/lib/types';

function timeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'expiring';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
}

export function InventoryPanel() {
  const { inventory, equipment, messages, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const showLevelUp = useUiStore((s) => s.showLevelUp);
  const [busy, setBusy] = useState<string | null>(null);

  // Loot lands via won encounters; an unread victory means unseen spoils.
  const newLoot = messages.some((m) => !m.read && m.kind === 'encounter_won');

  if (inventory.length === 0 && equipment.length === 0) {
    return (
      <SystemWindow title="Inventory" accent="purple" delay={0.18} collapsible defaultCollapsed>
        <p className="font-sys text-xs text-slate-500">
          Empty. Explore from the Training tab to win consumables and gear.
        </p>
      </SystemWindow>
    );
  }

  async function act(action: 'use-item' | 'equip-item', itemKey: string) {
    if (busy) return;
    setBusy(itemKey);
    try {
      const res = await gameAction<{ award?: XpAward }>(action, { item_key: itemKey });
      const def = itemDef(itemKey);
      pushAlert({
        kind: 'success',
        title: action === 'equip-item' ? 'Gear equipped' : 'Item used',
        body: def?.name,
      });
      if (res.award?.leveled_up) showLevelUp(res.award.new_level);
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Could not use item',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  async function unequip(id: string) {
    if (busy) return;
    setBusy(id);
    try {
      await gameAction('unequip-item', { id });
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Could not unequip',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <SystemWindow
      title="Inventory"
      accent="purple"
      delay={0.18}
      collapsible
      defaultCollapsed
      attention={newLoot}
    >
      {equipment.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 font-sys text-[0.6rem] uppercase tracking-[0.25em] text-slate-500">
            Equipped
          </div>
          <ul className="flex flex-col gap-2">
            {equipment.map((e) => {
              const def = itemDef(e.item_key);
              return (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-2 border border-accent-gold/40 bg-accent-gold/10 p-2"
                >
                  <div className="min-w-0">
                    <div className="truncate font-display text-sm font-semibold text-white">
                      {def?.name ?? e.item_key}
                    </div>
                    <div className="font-sys text-[0.6rem] uppercase tracking-widest text-accent-gold">
                      {timeLeft(e.expires_at)}
                    </div>
                  </div>
                  <button
                    className="sys-btn sys-btn-ghost shrink-0 !min-h-[30px] !py-1 !text-[0.6rem]"
                    disabled={busy === e.id}
                    onClick={() => unequip(e.id)}
                  >
                    Unequip
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {inventory.length > 0 && (
        <ul className="flex flex-col gap-2">
          {inventory.map((item) => {
            const def = itemDef(item.item_key);
            const isGearItem = def?.category === 'gear';
            return (
              <li
                key={item.item_key}
                className="flex items-center justify-between gap-2 border border-accent-cyan/20 bg-bg-base/40 p-2"
              >
                <div className="min-w-0">
                  <div className="truncate font-display text-sm font-semibold text-white">
                    {def?.name ?? item.item_key}
                    <span className="ml-2 font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
                      ×{item.quantity}
                    </span>
                  </div>
                  <div className="font-sys text-[0.6rem] text-slate-400">{def?.description}</div>
                  {isGearItem && (
                    <div className="font-sys text-[0.55rem] uppercase tracking-widest text-slate-600">
                      Consumed on equip
                    </div>
                  )}
                </div>
                <button
                  className="sys-btn shrink-0 !min-h-[30px] !py-1 !text-[0.6rem]"
                  disabled={busy === item.item_key}
                  onClick={() => act(isGearItem ? 'equip-item' : 'use-item', item.item_key)}
                >
                  {isGearItem ? 'Equip' : 'Use'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SystemWindow>
  );
}
