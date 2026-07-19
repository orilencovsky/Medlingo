import { describe, it, expect, vi } from 'vitest';
import { fetchAllRows } from './fetchAll';

function pageFrom(rows: number[]) {
  return vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, to + 1),
    error: null,
  }));
}

describe('fetchAllRows', () => {
  it('returns a short single page in one request', async () => {
    const page = pageFrom([1, 2, 3]);
    expect(await fetchAllRows(page)).toEqual([1, 2, 3]);
    expect(page).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledWith(0, 999);
  });

  it('pages past the 1000-row cap and concatenates in order', async () => {
    const rows = Array.from({ length: 1187 }, (_, i) => i);
    const page = pageFrom(rows);
    const result = await fetchAllRows(page);
    expect(result).toHaveLength(1187);
    expect(result[0]).toBe(0);
    expect(result[1186]).toBe(1186);
    expect(page).toHaveBeenCalledTimes(2);
    expect(page).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it('makes one extra empty request when the total is an exact page multiple', async () => {
    const page = pageFrom(Array.from({ length: 2000 }, (_, i) => i));
    expect(await fetchAllRows(page)).toHaveLength(2000);
    expect(page).toHaveBeenCalledTimes(3);
  });

  it('throws on a page error', async () => {
    const page = vi.fn(async () => ({ data: null, error: new Error('boom') }));
    await expect(fetchAllRows(page)).rejects.toThrow('boom');
  });

  it('treats null data without error as an empty page', async () => {
    const page = vi.fn(async () => ({ data: null, error: null }));
    expect(await fetchAllRows(page)).toEqual([]);
  });
});
