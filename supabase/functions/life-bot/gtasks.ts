// ═════════════════════════════════════════════════════════════════════════
// Google Tasks through the owner's Apps Script bridge (life/google-tasks-bridge.gs).
// There is no Google Tasks connector, and an Apps Script web app running as the
// owner needs no OAuth client or refresh token. Secrets: GTASKS_URL, GTASKS_SECRET.
// ═════════════════════════════════════════════════════════════════════════

export type GTask = { id: string; title: string; notes: string; due: string | null; status: 'needsAction' | 'completed'; completed: string | null; deleted: boolean; updated: string; list?: string };

export const gtasksEnabled = () => !!(Deno.env.get('GTASKS_URL') && Deno.env.get('GTASKS_SECRET'));

export async function gcall<T = unknown>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  const url = Deno.env.get('GTASKS_URL'), secret = Deno.env.get('GTASKS_SECRET');
  if (!url || !secret) throw new Error('Google Tasks is not linked yet');
  // Apps Script answers a POST with a redirect to the result; fetch follows it.
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ secret, op, ...args }), redirect: 'follow' });
  const body = await res.text();
  let j: { result?: T; error?: string };
  try { j = JSON.parse(body); } catch { throw new Error(`Google Tasks bridge answered ${res.status}: ${body.slice(0, 120)}`); }
  if (j.error) throw new Error(`Google Tasks: ${j.error}`);
  return j.result as T;
}
