import { describe, it, expect } from 'vitest';
import { parseTsv } from './tsv';

describe('parseTsv', () => {
  it('parses header + rows into records', () => {
    const rows = parseTsv('a\tb\n1\t2\n3\t4\n');
    expect(rows).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }]);
  });
  it('keeps empty cells as empty strings and skips blank lines', () => {
    const rows = parseTsv('a\tb\n1\t\n\n');
    expect(rows).toEqual([{ a: '1', b: '' }]);
  });
  it('throws on a row with the wrong column count', () => {
    expect(() => parseTsv('a\tb\n1\t2\t3\n')).toThrow(/row 2/);
  });
});
