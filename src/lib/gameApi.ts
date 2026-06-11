import { supabase } from './supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

/** Invoke a trusted game action on the `game` edge function. */
export async function gameAction<T = unknown>(action: string, payload?: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke('game', {
    body: { action, payload },
  });
  if (error) {
    let message = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        if (body?.error) message = body.error;
      } catch {
        // keep generic message
      }
    }
    throw new Error(message);
  }
  return data as T;
}
