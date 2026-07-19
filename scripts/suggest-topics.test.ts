import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseTopicResponse, classify } from './suggest-topics';

describe('parseTopicResponse', () => {
  it('accepts a bare valid slug', () => {
    expect(parseTopicResponse('cardiology')).toBe('cardiology');
  });
  it('trims and lowercases', () => {
    expect(parseTopicResponse('  Cardiology\n')).toBe('cardiology');
  });
  it('extracts the slug when the model adds a sentence', () => {
    expect(parseTopicResponse('The topic is respiratory.')).toBe('respiratory');
  });
  it('returns null for an unknown label (no fabrication)', () => {
    expect(parseTopicResponse('oncology')).toBeNull();
  });
  it('returns null when two different slugs appear (ambiguous)', () => {
    expect(parseTopicResponse('cardiology or respiratory')).toBeNull();
  });
  it('returns null for empty', () => {
    expect(parseTopicResponse('')).toBeNull();
  });
  it('does not false-match a slug inside a longer word', () => {
    expect(parseTopicResponse('gastrointestinal')).toBeNull();
    expect(parseTopicResponse('mental_healthcare')).toBeNull();
  });
  it('returns the slug when it repeats (not ambiguous)', () => {
    expect(parseTopicResponse('cardiology, cardiology')).toBe('cardiology');
  });
});

describe('classify', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('includes the response body in the thrown error on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { type: 'invalid_request_error', message: 'model: not found' } }),
    })));
    await expect(classify('חום', 'fever', null)).rejects.toThrow(/400.*not found/s);
  });
});
