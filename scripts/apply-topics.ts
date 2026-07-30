/**
 * Applies clinical topics from a manifest TSV (columns: id, topic) to dictionary_entries.
 * Only fills rows whose topic is still null, so reviewer-set topics are never overwritten.
 *
 *   npx tsx scripts/apply-topics.ts content/topics-second-thousand.tsv
 */
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import { parseTsv } from './tsv';

const TOPICS = new Set(['anatomy', 'symptoms', 'cardiology', 'respiratory', 'gastro', 'neuro',
  'msk', 'genitourinary', 'endocrine', 'dermatology', 'medications', 'procedures', 'lab_imaging',
  'emergency', 'mental_health', 'obgyn', 'pediatrics', 'infectious', 'general']);

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('usage: apply-topics.ts <manifest.tsv>');
  const rows = parseTsv(readFileSync(file, 'utf8'));
  for (const [i, r] of rows.entries()) {
    if (!r.id) throw new Error(`${file} row ${i + 2}: missing id`);
    if (!TOPICS.has(r.topic ?? '')) throw new Error(`${file} row ${i + 2}: bad topic "${r.topic}"`);
  }

  config({ path: '.env.content' });
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.DATABASE_URL!);

  let updated = 0;
  await sql.begin(async (tx) => {
    for (const r of rows) {
      const res = await tx`update dictionary_entries set topic = ${r.topic}
        where id = ${r.id} and topic is null`;
      updated += res.count;
    }
  });

  const [n] = await sql<{ total: number; tagged: number }[]>`
    select count(*)::int as total, count(topic)::int as tagged from dictionary_entries`;
  console.log(`manifest ${rows.length} · updated ${updated} · tagged ${n.tagged}/${n.total}`);
  await sql.end();
}

main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
