import { describe, it, expect } from 'vitest';
import { TOPICS, isTopic } from './topics';

describe('topics vocabulary', () => {
  it('has exactly 19 unique slugs', () => {
    expect(TOPICS).toHaveLength(19);
    expect(new Set(TOPICS).size).toBe(19);
  });
  it('isTopic accepts a known slug and rejects others', () => {
    expect(isTopic('cardiology')).toBe(true);
    expect(isTopic('Cardiology')).toBe(false);
    expect(isTopic('not-a-topic')).toBe(false);
    expect(isTopic('')).toBe(false);
  });
});
