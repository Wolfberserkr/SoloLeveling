// Ensure today's System Event exists for a user — shared by the `game`
// function's lazy daily reset and the `cron` tick, whichever touches the
// day first. The roll is deterministic per user+date and the table has a
// unique (user_id, local_date), so double invocation cannot double-spawn.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { rollSystemEvent } from './game/events.ts';

export type SystemEventRow = {
  id: string;
  user_id: string;
  local_date: string;
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  status: 'active' | 'completed' | 'expired';
  xp_reward: number;
};

/** Expire stale events, roll today's, apply instant effects. Idempotent. */
export async function ensureSystemEvent(
  db: SupabaseClient,
  userId: string,
  today: string,
  level: number,
): Promise<SystemEventRow | null> {
  // Yesterday's gate that was never cleared closes for good.
  await db
    .from('system_events')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .eq('status', 'active')
    .lt('local_date', today);

  const { data: existing } = await db
    .from('system_events')
    .select('*')
    .eq('user_id', userId)
    .eq('local_date', today)
    .maybeSingle();
  if (existing) return existing as SystemEventRow;

  const roll = rollSystemEvent(userId, today, level);
  if (!roll) return null;

  const { data: created, error } = await db
    .from('system_events')
    .insert({
      user_id: userId,
      local_date: today,
      kind: roll.kind,
      title: roll.title,
      body: roll.body,
      payload: roll.payload,
      xp_reward: roll.xpReward,
    })
    .select('*')
    .single();
  if (error) {
    // Unique violation means the other entry point won the race — fetch theirs.
    if (error.code === '23505') {
      const { data } = await db
        .from('system_events')
        .select('*')
        .eq('user_id', userId)
        .eq('local_date', today)
        .maybeSingle();
      return (data as SystemEventRow) ?? null;
    }
    console.error('system_events insert failed:', error);
    return null;
  }

  // Instant effects + the announcement land exactly once, with the insert.
  if (roll.kind === 'potion_gift') {
    const { data: profile } = await db
      .from('profiles')
      .select('mana_potions')
      .eq('user_id', userId)
      .single();
    await db
      .from('profiles')
      .update({ mana_potions: (profile?.mana_potions ?? 0) + 1 })
      .eq('user_id', userId);
  }
  await db.from('system_messages').insert({
    user_id: userId,
    kind: `event_${roll.kind}`,
    title: roll.title,
    body: roll.body,
    payload: { event_id: created.id },
  });

  return created as SystemEventRow;
}
