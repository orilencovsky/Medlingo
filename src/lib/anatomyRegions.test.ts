import { describe, expect, it } from 'vitest';
import { REGIONS, isRegion } from './anatomyRegions';

describe('anatomyRegions', () => {
  it('accepts every declared region', () => {
    for (const r of REGIONS) expect(isRegion(r)).toBe(true);
  });
  it('rejects an unknown region', () => {
    expect(isRegion('nope')).toBe(false);
  });
});
