import { describe, expect, it } from 'vitest';
import { anatomyThumbUrl } from './anatomyThumb';

describe('anatomyThumbUrl', () => {
  it('rewrites a Supabase object-storage URL to a sized image-transform URL', () => {
    const url = 'https://proj.supabase.co/storage/v1/object/public/anatomy/heart/curated-heart.webp';
    expect(anatomyThumbUrl(url, 400)).toBe(
      'https://proj.supabase.co/storage/v1/render/image/public/anatomy/heart/curated-heart.webp'
      + '?width=400&height=400&resize=cover&quality=70',
    );
  });

  it('leaves a non-Supabase URL unchanged, e.g. test fixtures', () => {
    expect(anatomyThumbUrl('https://cdn.test/keev.webp', 400)).toBe('https://cdn.test/keev.webp');
  });
});
