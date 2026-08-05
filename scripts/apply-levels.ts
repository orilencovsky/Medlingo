/**
 * Syncs the `level` column from content/dictionary.tsv into dictionary_entries.
 * `level` records which vocabulary file a word arrived in (first list → 1, second
 * thousand → 2, third list → 3) and the TSV is authoritative for it, so this
 * overwrites level — and only level — on matching rows; reviewer-owned edits to
 * every other column are left untouched (unlike a full import:content upsert).
 *
 *   npm run apply:levels
 */
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import { validateDictionary } from './import-content';

async function main() {
  const entries = validateDictionary(readFileSync('content/dictionary.tsv', 'utf8'), 'dictionary.tsv');

  config({ path: '.env.content' });
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.DATABASE_URL!);

  let updated = 0;
  await sql.begin(async (tx) => {
    for (const d of entries) {
      const res = await tx`update dictionary_entries set level = ${d.level}
        where id = ${d.id} and level <> ${d.level}`;
      updated += res.count;
    }
  });

  const dist = await sql<{ level: number; n: number }[]>`
    select level, count(*)::int as n from dictionary_entries group by level order by level`;
  console.log(`tsv ${entries.length} · levels changed ${updated} · db now ${
    dist.map((r) => `L${r.level}:${r.n}`).join(' ')}`);
  await sql.end();
}

main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
