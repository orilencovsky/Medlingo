import { writeFileSync } from 'node:fs';
import type { DictEntry } from './import-content';

const COLUMNS = ['id', 'hebrew', 'hebrew_nikud', 'part_of_speech', 'level', 'gender', 'plural',
  'root', 'everyday_synonym', 'en', 'ar', 'ru', 'fr', 'notes', 'category'] as const;

const cell = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export function serializeDictionary(rows: DictEntry[]): string {
  const lines = [COLUMNS.join('\t')];
  for (const r of rows) {
    lines.push(COLUMNS.map((c) => cell((r as Record<string, unknown>)[c])).join('\t'));
  }
  return lines.join('\n') + '\n';
}

type DbRow = {
  id: string; hebrew: string; hebrew_nikud: string; part_of_speech: DictEntry['part_of_speech'];
  level: number; gender: 'ז' | 'נ' | null; plural: string | null; root: string | null;
  everyday_synonym: string | null; translations: { en: string; ar?: string | null; ru?: string | null; fr?: string | null };
  notes: string | null; category: 'medical_loanword' | null;
};

function toDictEntry(r: DbRow): DictEntry {
  return {
    id: r.id, hebrew: r.hebrew, hebrew_nikud: r.hebrew_nikud, part_of_speech: r.part_of_speech,
    level: r.level, gender: r.gender, plural: r.plural, root: r.root, everyday_synonym: r.everyday_synonym,
    en: r.translations.en, ar: r.translations.ar ?? null, ru: r.translations.ru ?? null,
    fr: r.translations.fr ?? null, notes: r.notes, category: r.category,
  };
}

async function main() {
  const { config } = await import('dotenv');
  config({ path: '.env.content' });
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.DATABASE_URL!);
  const dbRows = await sql<DbRow[]>`
    select id, hebrew, hebrew_nikud, part_of_speech, level, gender, plural, root,
           everyday_synonym, translations, notes, category
    from dictionary_entries where is_deprecated = false order by id`;
  const rows = dbRows.map(toDictEntry);
  writeFileSync('content/dictionary.tsv', serializeDictionary(rows), 'utf8');
  console.log(`content/dictionary.tsv: ${rows.length} rows exported`);
  await sql.end();
}

const isDirectRun = process.argv[1]?.endsWith('export-content.ts');
if (isDirectRun) {
  main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
