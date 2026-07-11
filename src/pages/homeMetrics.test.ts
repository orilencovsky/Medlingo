import { describe, it, expect } from 'vitest';
import { computeOverallProgress } from './homeMetrics';
import type { CardState, Unit } from '../lib/types';

function unit(slug: string, status: 'draft' | 'published'): Unit {
  return { slug, level: 1, displayOrder: 1, status, title: { en: slug }, dialogue: [] };
}

function card(entryId: string, state: CardState['state'], stability: number, reps: number): CardState {
  return {
    entryId, due: new Date(), stability, difficulty: 5, reps, lapses: 0,
    learningSteps: 0, state, lastReview: null,
  };
}

describe('computeOverallProgress', () => {
  it('counts covered and mastered only within published units', () => {
    const units = [unit('u1', 'published'), unit('u2', 'draft')];
    const entryIds = { u1: ['a', 'b'], u2: ['c'] };
    const cards = [card('a', 'review', 8, 5), card('b', 'learning', 1, 1), card('c', 'review', 8, 5)];
    const result = computeOverallProgress(units, cards, entryIds);
    expect(result.total).toBe(2); // c excluded — belongs only to the draft unit
    expect(result.covered).toBe(2); // a and b both started
    expect(result.mastered).toBe(1); // only a meets stability >= 7
    expect(result.coveredPct).toBe(100);
    expect(result.masteredPct).toBe(50);
  });

  it('returns all zeros for a brand new user with no cards', () => {
    const units = [unit('u1', 'published')];
    const entryIds = { u1: ['a', 'b'] };
    const result = computeOverallProgress(units, [], entryIds);
    expect(result).toEqual({ total: 2, covered: 0, mastered: 0, coveredPct: 0, masteredPct: 0 });
  });

  it('returns all zeros when there are no published units', () => {
    const units = [unit('u1', 'draft')];
    const entryIds = { u1: ['a'] };
    const result = computeOverallProgress(units, [card('a', 'review', 8, 5)], entryIds);
    expect(result).toEqual({ total: 0, covered: 0, mastered: 0, coveredPct: 0, masteredPct: 0 });
  });

  it('deduplicates an entry id shared across two published units', () => {
    const units = [unit('u1', 'published'), unit('u2', 'published')];
    const entryIds = { u1: ['a'], u2: ['a'] };
    const result = computeOverallProgress(units, [card('a', 'review', 8, 5)], entryIds);
    expect(result.total).toBe(1);
  });

  it('counts an id shared between a published and a draft unit exactly once, from the published unit', () => {
    const units = [unit('u1', 'published'), unit('u2', 'draft')];
    const entryIds = { u1: ['x'], u2: ['x'] };
    const result = computeOverallProgress(units, [card('x', 'review', 8, 5)], entryIds);
    expect(result).toEqual({ total: 1, covered: 1, mastered: 1, coveredPct: 100, masteredPct: 100 });
  });

  it('does not count an entry with an existing card at reps 0 as covered', () => {
    const units = [unit('u1', 'published')];
    const entryIds = { u1: ['y'] };
    const result = computeOverallProgress(units, [card('y', 'new', 0, 0)], entryIds);
    expect(result).toEqual({ total: 1, covered: 0, mastered: 0, coveredPct: 0, masteredPct: 0 });
  });
});
