import { useState } from 'react';

/**
 * useState persisted to sessionStorage. Keeps in-progress checklists (gym set
 * ticks, boss confirmations) alive across refreshes and tab switches; key the
 * caller by date so yesterday's state never leaks into today.
 */
export function useSessionState<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw != null) return JSON.parse(raw) as T;
    } catch {
      // ignore — fall through to the initial value
    }
    return initial;
  });

  function set(next: T | ((prev: T) => T)) {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      try {
        sessionStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        // storage full/unavailable — state still works for this render tree
      }
      return resolved;
    });
  }

  return [value, set];
}
