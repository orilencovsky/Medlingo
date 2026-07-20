import { describe, expect, it } from 'vitest';
import { SYSTEMS, isSystem } from './anatomySystems';

describe('anatomySystems', () => {
  it('accepts every declared system', () => {
    for (const s of SYSTEMS) expect(isSystem(s)).toBe(true);
  });
  it('rejects an unknown system', () => {
    expect(isSystem('nope')).toBe(false);
  });
});
