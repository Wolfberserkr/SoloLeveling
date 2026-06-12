// ─────────────────────────────────────────────────────────────────────────────
// RIDDLES — Phase 6. The System speaks in riddles.
//
// A riddle event poses a question; the Player gets a few attempts to answer
// before midnight. The answer lives server-side only (riddle_answers has no
// client grant) — solving it is the only way to see it early. Riddles are
// AI-generated when a Gemini key is configured; otherwise the System falls
// back to this bank, picked deterministically per user+date.
//
// This file must stay pure (no Deno/Node/DOM) — it is shared with the client
// and unit-tested.
// ─────────────────────────────────────────────────────────────────────────────

export const RIDDLE_MAX_ATTEMPTS = 3;

/** An answer may carry aliases separated by `|` — any of them counts. */
export type Riddle = { prompt: string; answer: string };

/**
 * Normalize a free-text answer for comparison: lowercase, strip punctuation,
 * collapse whitespace, and drop a leading article ("a"/"an"/"the").
 */
export function normalizeAnswer(s: string): string {
  let t = s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // diacritics
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(/^(a|an|the) /, '');
  return t;
}

/**
 * Does a guess match the stored answer? Exact match after normalization, or —
 * for short guesses like "it's an echo" — the answer as a whole word inside
 * the guess. Long pastes don't count: the Player must commit to an answer.
 */
export function answerMatches(guess: string, answer: string): boolean {
  const g = normalizeAnswer(guess);
  if (!g) return false;
  for (const alias of answer.split('|')) {
    const a = normalizeAnswer(alias);
    if (!a) continue;
    if (g === a) return true;
    if (g.split(' ').length <= 6 && new RegExp(`\\b${escapeRegExp(a)}\\b`).test(g)) return true;
  }
  return false;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Themes handed to the AI so generated riddles don't converge on "echo". */
export const RIDDLE_THEMES = [
  'time',
  'shadow',
  'fire',
  'water',
  'memory',
  'iron',
  'silence',
  'hunger',
  'night',
  'strength',
  'a mirror',
  'a door',
] as const;

export function riddleTheme(rand: () => number): string {
  return RIDDLE_THEMES[Math.floor(rand() * RIDDLE_THEMES.length)];
}

/** Offline bank — the System never goes quiet just because the AI did. */
export const FALLBACK_RIDDLES: Riddle[] = [
  {
    prompt:
      'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?',
    answer: 'echo',
  },
  { prompt: 'The more of me you take, the more you leave behind. What am I?', answer: 'footsteps|steps|footprints' },
  { prompt: 'I am tall when I am young, and short when I am old. What am I?', answer: 'candle' },
  {
    prompt: 'I have cities, but no houses; forests, but no trees; and water, but no fish. What am I?',
    answer: 'map',
  },
  { prompt: 'What can fill a room but takes up no space?', answer: 'light' },
  {
    prompt: 'I have keys but open no locks, space but no room. You can enter, but never go outside. What am I?',
    answer: 'keyboard',
  },
  {
    prompt:
      'The one who makes me sells me. The one who buys me never uses me. The one who uses me never knows. What am I?',
    answer: 'coffin',
  },
  { prompt: 'What gets wetter the more it dries?', answer: 'towel' },
  {
    prompt: 'I am always hungry and must always be fed. The finger I touch will soon turn red. What am I?',
    answer: 'fire',
  },
  { prompt: 'What belongs to you, but others use it more than you do?', answer: 'name|your name|my name' },
  {
    prompt: 'If you have me, you want to share me. If you share me, you no longer have me. What am I?',
    answer: 'secret',
  },
  { prompt: 'What breaks the moment you speak its name?', answer: 'silence' },
  {
    prompt: 'I follow you all day in the light, yet vanish in the dark. I never say a word. What am I?',
    answer: 'shadow|your shadow|my shadow',
  },
  { prompt: 'What goes up but never comes down?', answer: 'age|your age|my age' },
];

export function fallbackRiddle(rand: () => number): Riddle {
  return FALLBACK_RIDDLES[Math.floor(rand() * FALLBACK_RIDDLES.length)];
}
