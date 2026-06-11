// Deterministic seeded RNG — quest generation and event scheduling must be
// reproducible for the same user + date (idempotent daily resets).

/** FNV-1a string hash → 32-bit seed. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG. Returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded RNG for a user+date (+salt) — same inputs, same sequence. */
export function dailyRng(userId: string, localDate: string, salt = ''): () => number {
  return mulberry32(hashString(`${userId}:${localDate}:${salt}`));
}

/** Pick one item by weight using the provided RNG. */
export function pickWeighted<T>(rand: () => number, items: T[], weightOf: (item: T) => number): T {
  const total = items.reduce((sum, it) => sum + weightOf(it), 0);
  let roll = rand() * total;
  for (const it of items) {
    roll -= weightOf(it);
    if (roll <= 0) return it;
  }
  return items[items.length - 1];
}
