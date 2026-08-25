// Which accounts see the light "Reset" workout UI instead of the dark System
// RPG. Hardcoded allowlist, matched against the logged-in email (the Supabase
// session already carries it — no DB flag or query needed).
//
// ▸ TO ADD SOMEONE: append their account email below, lowercase, then
//   redeploy. The account itself is a normal Supabase Auth user — they sign
//   up through the login page like anyone else; this list only decides which
//   UI they land in. Never put credentials in this file.
//
// Each entry gets its own independent copy of the program: all Reset state
// (progress, swaps, logged sessions, weights) is keyed by the Supabase user
// id, so two Reset accounts never see or overwrite each other's training.
export const RESET_EMAILS: string[] = [
  'thebeautyroombyd@gmail.com',
  'ulrich0886@gmail.com',
];

/** True when this email should be routed to the Reset portal. */
export function isResetAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  return RESET_EMAILS.includes(email.trim().toLowerCase());
}
