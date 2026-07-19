// Supabase PostgREST caps every request at the project's Max Rows setting
// (default 1000). Any whole-table read must page through .range() or it
// silently truncates — the dictionary crossed 1000 entries and the cap bit.
// Callers must order by a unique tiebreaker (id) so page boundaries are stable.
const PAGE = 1000;

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
}
