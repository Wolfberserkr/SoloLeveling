// Which app a signed-in player opened this session: the System RPG or Ascend.
// Kept in sessionStorage, so every fresh launch (and every sign-in) starts at
// the chooser, while a reload or back-from-background stays where you were.
export type Portal = 'system' | 'ascend';
const KEY = 'portal_v1';

export function getPortal(): Portal | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return v === 'system' || v === 'ascend' ? v : null;
  } catch {
    return null;
  }
}

export function setPortal(p: Portal | null) {
  try {
    if (p) sessionStorage.setItem(KEY, p);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: the chooser simply shows again */
  }
}
