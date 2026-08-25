import { describe, it, expect } from 'vitest';
import { RESET_EMAILS, isResetAccount } from '../src/features/reset/resetAccounts';

describe('reset portal allowlist', () => {
  it('routes every listed account to the Reset portal', () => {
    expect(RESET_EMAILS.length).toBeGreaterThan(0);
    for (const email of RESET_EMAILS) expect(isResetAccount(email), email).toBe(true);
  });

  it('stores entries lowercase and trimmed, since the match is exact', () => {
    // A stray capital or space in the list silently sends someone to the dark
    // System app instead — the one failure mode this list has.
    for (const email of RESET_EMAILS) {
      expect(email, `${email} must be stored lowercase/trimmed`).toBe(email.trim().toLowerCase());
      expect(email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
    }
    expect(new Set(RESET_EMAILS).size, 'no duplicate entries').toBe(RESET_EMAILS.length);
  });

  it('normalises what the session hands it', () => {
    const [first] = RESET_EMAILS;
    expect(isResetAccount(first.toUpperCase())).toBe(true);
    expect(isResetAccount(`  ${first}  `)).toBe(true);
  });

  it('keeps everyone else on the System app', () => {
    expect(isResetAccount('someone-else@gmail.com')).toBe(false);
    expect(isResetAccount('')).toBe(false);
    expect(isResetAccount(null)).toBe(false);
    expect(isResetAccount(undefined)).toBe(false);
    // Not a substring match: a lookalike address must not slip through.
    expect(isResetAccount(`x${RESET_EMAILS[0]}`)).toBe(false);
  });

  it('carries no credentials in the source file', async () => {
    // The allowlist is emails only; passwords live in Supabase Auth.
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile('src/features/reset/resetAccounts.ts', 'utf8'));
    expect(src).not.toMatch(/password|passwd|secret|apikey|api_key/i);
  });
});
