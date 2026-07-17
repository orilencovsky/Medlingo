import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  validateDictionary, validateItems, loadContent,
} from './import-content';

const fixture = (name: string) => readFileSync(`content/fixtures/${name}`, 'utf8');

describe('content validation', () => {
  it('accepts the real content files', () => {
    const content = loadContent('content');
    expect(content.dictionary).toHaveLength(1153);
    expect(content.units).toHaveLength(4);
    expect(content.units[0].items).toHaveLength(12);
    expect(content.units[0].dialogue).toHaveLength(12);
  });
  it('rejects a missing en translation with the row number', () => {
    expect(() => validateDictionary(fixture('missing-en.tsv'), 'missing-en.tsv'))
      .toThrow(/missing-en.tsv row 2.*en/);
  });
  it('rejects an out-of-range level', () => {
    expect(() => validateDictionary(fixture('bad-level.tsv'), 'bad-level.tsv'))
      .toThrow(/bad-level.tsv row 2.*level/);
  });
  it('rejects duplicate ids', () => {
    expect(() => validateDictionary(fixture('duplicate-id.tsv'), 'duplicate-id.tsv'))
      .toThrow(/duplicate id "x1"/);
  });
  it('rejects an items file referencing an unknown entry', () => {
    const dict = validateDictionary(readFileSync('content/dictionary.tsv', 'utf8'), 'dictionary.tsv');
    expect(() => validateItems(fixture('unknown-entry.items.tsv'), 'unknown-entry.items.tsv', dict))
      .toThrow(/unknown entry_id "no-such-entry"/);
  });
  it('rejects an item whose headword is absent from its context sentence', () => {
    const dict = validateDictionary(readFileSync('content/dictionary.tsv', 'utf8'), 'dictionary.tsv');
    expect(() => validateItems(
      fixture('headword-not-in-context.items.tsv'), 'headword-not-in-context.items.tsv', dict))
      .toThrow(/trufa.*תרופה.*context/);
  });
});
