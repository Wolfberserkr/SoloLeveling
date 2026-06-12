import { describe, it, expect } from 'vitest';
import {
  normalizeAnswer,
  answerMatches,
  fallbackRiddle,
  riddleTheme,
  FALLBACK_RIDDLES,
  RIDDLE_THEMES,
  RIDDLE_MAX_ATTEMPTS,
} from '@game/riddles.ts';
import { mulberry32 } from '@game/rng.ts';

describe('answer normalization', () => {
  it('lowercases, strips punctuation, and collapses whitespace', () => {
    expect(normalizeAnswer('  The   Echo!! ')).toBe('echo');
    expect(normalizeAnswer("it's a CANDLE.")).toBe('it s a candle');
    expect(normalizeAnswer('Café')).toBe('cafe');
  });

  it('drops a single leading article', () => {
    expect(normalizeAnswer('a shadow')).toBe('shadow');
    expect(normalizeAnswer('an echo')).toBe('echo');
    expect(normalizeAnswer('the map')).toBe('map');
    // only the leading one — inner words survive
    expect(normalizeAnswer('the name of the wind')).toBe('name of the wind');
  });
});

describe('answer matching', () => {
  it('accepts exact and article-prefixed matches', () => {
    expect(answerMatches('echo', 'echo')).toBe(true);
    expect(answerMatches('An Echo', 'echo')).toBe(true);
    expect(answerMatches('ECHO!', 'echo')).toBe(true);
  });

  it('accepts the answer embedded in a short sentence, as a whole word', () => {
    expect(answerMatches("it's an echo", 'echo')).toBe(true);
    expect(answerMatches('is it a candle?', 'candle')).toBe(true);
    expect(answerMatches('echoes', 'echo')).toBe(false); // not a whole word
  });

  it('rejects wrong answers and empty guesses', () => {
    expect(answerMatches('shadow', 'echo')).toBe(false);
    expect(answerMatches('', 'echo')).toBe(false);
    expect(answerMatches('   ', 'echo')).toBe(false);
  });

  it('rejects long pastes that merely contain the answer', () => {
    const paste =
      'maybe it is an echo or a shadow or a candle or a map or light or fire who knows';
    expect(answerMatches(paste, 'echo')).toBe(false);
  });

  it('honors | aliases', () => {
    expect(answerMatches('footprints', 'footsteps|steps|footprints')).toBe(true);
    expect(answerMatches('your name', 'name|your name|my name')).toBe(true);
    expect(answerMatches('fame', 'name|your name|my name')).toBe(false);
  });
});

describe('fallback riddle bank', () => {
  it('every riddle has a real prompt and a guessable answer', () => {
    for (const r of FALLBACK_RIDDLES) {
      expect(r.prompt.length).toBeGreaterThan(20);
      for (const alias of r.answer.split('|')) {
        expect(normalizeAnswer(alias).length).toBeGreaterThan(1);
      }
      // the canonical answer matches itself through the full pipeline
      expect(answerMatches(r.answer.split('|')[0], r.answer)).toBe(true);
    }
  });

  it('answers never leak into their own prompt', () => {
    for (const r of FALLBACK_RIDDLES) {
      const prompt = normalizeAnswer(r.prompt);
      for (const alias of r.answer.split('|')) {
        const bare = normalizeAnswer(alias).split(' ').pop()!;
        expect(prompt).not.toMatch(new RegExp(`\\b${bare}\\b`));
      }
    }
  });

  it('picks deterministically for the same seed', () => {
    expect(fallbackRiddle(mulberry32(42))).toEqual(fallbackRiddle(mulberry32(42)));
    expect(riddleTheme(mulberry32(7))).toBe(riddleTheme(mulberry32(7)));
  });

  it('a long-running player sees variety', () => {
    const rng = mulberry32(1);
    const seen = new Set(Array.from({ length: 200 }, () => fallbackRiddle(rng).prompt));
    expect(seen.size).toBe(FALLBACK_RIDDLES.length);
    const themes = new Set(Array.from({ length: 200 }, () => riddleTheme(rng)));
    expect(themes.size).toBe(RIDDLE_THEMES.length);
  });

  it('attempts are scarce', () => {
    expect(RIDDLE_MAX_ATTEMPTS).toBeGreaterThanOrEqual(1);
    expect(RIDDLE_MAX_ATTEMPTS).toBeLessThanOrEqual(5);
  });
});
