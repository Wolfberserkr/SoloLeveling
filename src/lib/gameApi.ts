import { supabase } from './supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

/** A hung edge call must not brick the UI: abort and let the player retry. */
const GAME_ACTION_TIMEOUT_MS = 15_000;

/** Invoke a trusted game action on the `game` edge function. */
export async function gameAction<T = unknown>(action: string, payload?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GAME_ACTION_TIMEOUT_MS);
  let data: T | null;
  let error: Error | null;
  try {
    ({ data, error } = await supabase.functions.invoke<T>('game', {
      body: { action, payload },
      signal: controller.signal,
    }));
  } catch (err) {
    // functions-js surfaces an aborted fetch as a rejection, not an error field.
    if (controller.signal.aborted) {
      throw new Error('The System did not respond. Check your connection and retry.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (error) {
    let message = error.message;
    if (error instanceof FunctionsHttpError) {
      const status = error.context?.status;
      try {
        const body = await error.context.json();
        if (body?.error) message = body.error;
      } catch {
        // keep generic message
      }
      // An expired session cannot recover on its own — force a clean re-login.
      if (status === 401) {
        void supabase.auth.signOut();
        message = 'Session expired. Re-establish the link.';
      }
    }
    throw new Error(message);
  }
  return data as T;
}
