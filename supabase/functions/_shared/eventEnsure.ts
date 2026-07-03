// Ensure today's System Events exist for a user — shared by the `game`
// function's lazy daily reset and the `cron` tick, whichever touches the
// day first. Rolls are deterministic per user+date+slot and the table has a
// unique (user_id, local_date, slot), so double invocation cannot
// double-spawn. Slot 1 spawns with the day's first contact; slot 2 (when its
// coin flip says so) materializes once the local afternoon arrives.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  rollSystemEvent,
  riddleBody,
  EVENT_SLOTS,
  SECOND_EVENT_HOUR,
  type SystemEventKind,
} from './game/events.ts';
import { generateRiddle } from './ai.ts';

export type SystemEventRow = {
  id: string;
  user_id: string;
  local_date: string;
  slot: number;
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  status: 'active' | 'completed' | 'expired';
  xp_reward: number;
};

/** Expire stale events, roll today's due slots, apply instant effects.
 * Idempotent. `hour` is the user's local hour — it gates when the second
 * slot becomes visible. Returns today's events, first slot first. */
export async function ensureSystemEvents(
  db: SupabaseClient,
  userId: string,
  today: string,
  level: number,
  hour: number,
): Promise<SystemEventRow[]> {
  // Yesterday's gate that was never cleared closes for good.
  await db
    .from('system_events')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .eq('status', 'active')
    .lt('local_date', today);

  const { data } = await db
    .from('system_events')
    .select('*')
    .eq('user_id', userId)
    .eq('local_date', today)
    .order('slot');
  const events = (data ?? []) as SystemEventRow[];

  for (let slot = 1; slot <= EVENT_SLOTS; slot++) {
    if (events.some((e) => e.slot === slot)) continue;
    if (slot > 1 && hour < SECOND_EVENT_HOUR) continue;
    const exclude = events.map((e) => e.kind as SystemEventKind);
    const created = await spawnEvent(db, userId, today, level, slot, exclude);
    if (created) events.push(created);
  }

  return events.sort((a, b) => a.slot - b.slot);
}

/** Roll and insert one slot's event; null when the roll says "quiet". */
async function spawnEvent(
  db: SupabaseClient,
  userId: string,
  today: string,
  level: number,
  slot: number,
  exclude: SystemEventKind[],
): Promise<SystemEventRow | null> {
  const roll = rollSystemEvent(userId, today, level, slot, exclude);
  if (!roll) return null;

  // Riddles (Phase 6): try the AI for a fresh one; the deterministic fallback
  // from the roll already fills body/answer if the Archive is silent.
  let riddle = roll.riddle ?? null;
  if (roll.kind === 'riddle' && riddle) {
    const generated = await generateRiddle(riddle.theme);
    if (generated) {
      riddle = { ...generated, theme: riddle.theme };
      roll.body = riddleBody(generated.prompt);
    }
  }

  const { data: created, error } = await db
    .from('system_events')
    .insert({
      user_id: userId,
      local_date: today,
      slot,
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
        .eq('slot', slot)
        .maybeSingle();
      return (data as SystemEventRow) ?? null;
    }
    console.error('system_events insert failed:', error);
    return null;
  }

  // Instant effects + the announcement land exactly once, with the insert.
  // The riddle's answer is stored where no client grant reaches (riddle_answers).
  if (roll.kind === 'riddle' && riddle) {
    const { error: answerErr } = await db.from('riddle_answers').insert({
      event_id: created.id,
      user_id: userId,
      answer: riddle.answer,
    });
    if (answerErr) console.error('riddle_answers insert failed:', answerErr);
  }
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
