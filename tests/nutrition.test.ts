import { describe, it, expect } from 'vitest';
import {
  NUTRITION_XP,
  SUPPLEMENT_STACK_XP,
  DEFAULT_PROTEIN_TARGET_G,
  PROTEIN_TARGET_MIN_G,
  PROTEIN_TARGET_MAX_G,
  MAX_PROTEIN_PER_LOG_G,
  MAX_PROTEIN_PER_DAY_G,
  suggestedProteinTarget,
  clampProteinTarget,
  accumulateProtein,
  proteinTargetMet,
  stackComplete,
} from '@game/nutrition.ts';
import { DAILY_XP_CAP, TRAINING_XP } from '@game/constants.ts';

describe('suggestedProteinTarget', () => {
  it('scales g/kg down as body fat rises (lean mass is the smaller fraction)', () => {
    // The founding scan: 116.5 kg @ 36.5% BF → 1.6 g/kg ≈ 186 g.
    expect(suggestedProteinTarget(116.5, 36.5)).toBe(186);
    // Mid body fat: 1.8 g/kg.
    expect(suggestedProteinTarget(90, 25)).toBe(162);
    // Lean: 2.0 g/kg.
    expect(suggestedProteinTarget(80, 15)).toBe(160);
  });

  it('falls back to the default on nonsense weight', () => {
    expect(suggestedProteinTarget(0)).toBe(DEFAULT_PROTEIN_TARGET_G);
    expect(suggestedProteinTarget(NaN)).toBe(DEFAULT_PROTEIN_TARGET_G);
  });

  it('never suggests outside the honest band', () => {
    expect(suggestedProteinTarget(30, 40)).toBeGreaterThanOrEqual(PROTEIN_TARGET_MIN_G);
    expect(suggestedProteinTarget(400, 5)).toBeLessThanOrEqual(PROTEIN_TARGET_MAX_G);
  });
});

describe('clampProteinTarget', () => {
  it('clamps and rounds into the honest band', () => {
    expect(clampProteinTarget(182.4)).toBe(182);
    expect(clampProteinTarget(10)).toBe(PROTEIN_TARGET_MIN_G);
    expect(clampProteinTarget(9000)).toBe(PROTEIN_TARGET_MAX_G);
    expect(clampProteinTarget(NaN)).toBe(DEFAULT_PROTEIN_TARGET_G);
  });
});

describe('accumulateProtein', () => {
  it('adds portions and keeps one-decimal precision', () => {
    expect(accumulateProtein(0, 25)).toBe(25);
    expect(accumulateProtein(120.5, 40)).toBe(160.5);
  });

  it('caps a single log entry and the daily total', () => {
    expect(accumulateProtein(0, 100000)).toBe(MAX_PROTEIN_PER_LOG_G);
    expect(accumulateProtein(MAX_PROTEIN_PER_DAY_G, 50)).toBe(MAX_PROTEIN_PER_DAY_G);
  });

  it('ignores negative and non-finite input', () => {
    expect(accumulateProtein(50, -20)).toBe(50);
    expect(accumulateProtein(50, NaN)).toBe(50);
    expect(accumulateProtein(NaN, 30)).toBe(30);
  });
});

describe('proteinTargetMet / stackComplete', () => {
  it('is met exactly at the target, not one gram before', () => {
    expect(proteinTargetMet(181, 182)).toBe(false);
    expect(proteinTargetMet(182, 182)).toBe(true);
    expect(proteinTargetMet(250, 182)).toBe(true);
  });

  it('requires every supplement in the stack', () => {
    expect(stackComplete(true, false)).toBe(false);
    expect(stackComplete(false, true)).toBe(false);
    expect(stackComplete(true, true)).toBe(true);
  });
});

describe('XP economy fit', () => {
  it('fuel + stack stays a fraction of the daily cap (food cannot outpace training)', () => {
    expect(NUTRITION_XP + SUPPLEMENT_STACK_XP).toBeLessThan(TRAINING_XP + 25);
    expect(NUTRITION_XP + SUPPLEMENT_STACK_XP).toBeLessThan(DAILY_XP_CAP / 5);
  });
});
