/**
 * Additive dictionary seed: inserts entries from content/dictionary.tsv that do not
 * exist in the DB yet, and leaves every existing row untouched (import:content, by
 * contrast, upserts all rows and bumps updated_at on entries the reviewers own).
 *
 * Idempotent: re-running inserts nothing. Topics are applied separately by
 * scripts/apply-topics.ts.
 */
import { config } from 'dotenv';
import { loadContent } from './import-content';

async function main() {
  config({ path: '.env.content' });
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.DATABASE_URL!);

  const { dictionary } = loadContent('content');
  const existing = await sql<{ id: string }[]>`select id from dictionary_entries`;
  const have = new Set(existing.map((r) => r.id));
  const fresh = dictionary.filter((d) => !have.has(d.id));
  console.log(`tsv ${dictionary.length} · in db ${have.size} · to insert ${fresh.length}`);
  if (fresh.length === 0) { await sql.end(); return; }

  await sql.begin(async (tx) => {
    for (const d of fresh) {
      const translations = { en: d.en, ar: d.ar, ru: d.ru, fr: d.fr };
      await tx`
        insert into dictionary_entries
          (id, hebrew, hebrew_nikud, part_of_speech, level, gender, plural, root,
           everyday_synonym, translations, notes, category)
        values (${d.id}, ${d.hebrew}, ${d.hebrew_nikud}, ${d.part_of_speech}, ${d.level},
                ${d.gender}, ${d.plural}, ${d.root}, ${d.everyday_synonym},
                ${tx.json(translations)}, ${d.notes}, ${d.category})
        on conflict (id) do nothing`;
    }
  });

  const [{ total }] = await sql<{ total: number }[]>`select count(*)::int as total from dictionary_entries`;
  console.log(`inserted ${fresh.length} · dictionary_entries now ${total}`);
  await sql.end();
}

main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
