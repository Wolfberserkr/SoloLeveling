// Which accounts see the light "Reset" workout UI instead of the dark System
// RPG. Hardcoded allowlist, matched against the logged-in email (the Supabase
// session already carries it — no DB flag or query needed).
//
// ▸ TO ENABLE D: add her account email below, lowercase, then redeploy.
//   e.g. export const RESET_EMAILS = ['d@example.com'];
export const RESET_EMAILS: string[] = [
  // 'her-email@example.com',
];

/** True when this email should be routed to the Reset portal. */
export function isResetAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  return RESET_EMAILS.includes(email.trim().toLowerCase());
}
