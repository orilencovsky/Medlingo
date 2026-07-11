import { readFileSync, readdirSync } from 'node:fs';
import { z } from 'zod';
import { parseTsv } from './tsv';

const optional = (s: string) => (s === '' ? null : s);

const DictRow = z.object({
  id: z.string().min(1),
  hebrew: z.string().min(1),
  hebrew_nikud: z.string().min(1),
  part_of_speech: z.enum(['noun', 'verb', 'adjective', 'phrase', 'abbreviation',
    'adverb', 'pronoun', 'preposition', 'conjunction', 'numeral', 'interjection', 'particle']),
  level: z.coerce.number().int().min(1).max(3),
  gender: z.enum(['ז', 'נ']).nullable(),
  plural: z.string().nullable(),
  root: z.string().nullable(),
  everyday_synonym: z.string().nullable(),
  en: z.string().min(1),
  ar: z.string().nullable(),
  ru: z.string().nullable(),
  fr: z.string().nullable(),
  notes: z.string().nullable(),
});
export type DictEntry = z.infer<typeof DictRow>;

const UnitRow = z.object({
  slug: z.string().min(1),
  level: z.coerce.number().int().min(1).max(3),
  display_order: z.coerce.number().int(),
  status: z.enum(['draft', 'published']),
  title_en: z.string().min(1),
});

const DialogueRow = z.object({
  line_order: z.coerce.number().int(),
  speaker: z.string().min(1),
  he: z.string().min(1),
  en: z.string().min(1),
});

const ItemRow = z.object({
  display_order: z.coerce.number().int(),
  entry_id: z.string().min(1),
  context_he: z.string().min(1),
  context_en: z.string().min(1),
});

function validateRows<T>(schema: z.ZodType<T>, raw: Array<Record<string, string>>, file: string,
  nullable: string[]): T[] {
  return raw.map((rec, i) => {
    const cooked: Record<string, unknown> = { ...rec };
    for (const k of nullable) cooked[k] = optional(rec[k] ?? '');
    const res = schema.safeParse(cooked);
    if (!res.success) {
      const issue = res.error.issues[0];
      throw new Error(`${file} row ${i + 2}: ${issue.path.join('.')} — ${issue.message}`);
    }
    return res.data;
  });
}

export function validateDictionary(text: string, file: string): DictEntry[] {
  const rows = validateRows(DictRow, parseTsv(text), file,
    ['gender', 'plural', 'root', 'everyday_synonym', 'ar', 'ru', 'fr', 'notes']);
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.id)) throw new Error(`${file}: duplicate id "${r.id}"`);
    seen.add(r.id);
  }
  return rows;
}

export function validateItems(text: string, file: string, dict: DictEntry[]) {
  const rows = validateRows(ItemRow, parseTsv(text), file, []);
  const byId = new Map(dict.map((d) => [d.id, d]));
  for (const r of rows) {
    const entry = byId.get(r.entry_id);
    if (!entry) throw new Error(`${file}: unknown entry_id "${r.entry_id}"`);
    // The cloze exercise blanks the headword in context_he by exact substring; if the
    // sentence uses an inflected form instead, the blank silently fails. Enforce here.
    if (!r.context_he.includes(entry.hebrew)) {
      throw new Error(
        `${file}: entry "${r.entry_id}" headword "${entry.hebrew}" not found in context_he "${r.context_he}"`);
    }
  }
  return rows;
}

export function loadContent(dir: string) {
  const dictionary = validateDictionary(readFileSync(`${dir}/dictionary.tsv`, 'utf8'), 'dictionary.tsv');
  const unitRows = validateRows(UnitRow, parseTsv(readFileSync(`${dir}/units.tsv`, 'utf8')), 'units.tsv', []);
  const files = readdirSync(`${dir}/units`);
  const units = unitRows.map((u) => {
    const dialogueFile = `${u.slug}.dialogue.tsv`;
    const itemsFile = `${u.slug}.items.tsv`;
    if (!files.includes(dialogueFile)) throw new Error(`units.tsv: missing ${dialogueFile}`);
    if (!files.includes(itemsFile)) throw new Error(`units.tsv: missing ${itemsFile}`);
    const dialogue = validateRows(DialogueRow,
      parseTsv(readFileSync(`${dir}/units/${dialogueFile}`, 'utf8')), dialogueFile, []);
    const items = validateItems(readFileSync(`${dir}/units/${itemsFile}`, 'utf8'), itemsFile, dictionary);
    return { ...u, dialogue, items };
  });
  return { dictionary, units };
}

async function main() {
  const { config } = await import('dotenv');
  config({ path: '.env.content' });
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.DATABASE_URL!);

  const { dictionary, units } = loadContent('content');

  await sql.begin(async (tx) => {
    for (const d of dictionary) {
      const translations = { en: d.en, ar: d.ar, ru: d.ru, fr: d.fr };
      await tx`
        insert into dictionary_entries
          (id, hebrew, hebrew_nikud, part_of_speech, level, gender, plural, root,
           everyday_synonym, translations, notes)
        values (${d.id}, ${d.hebrew}, ${d.hebrew_nikud}, ${d.part_of_speech}, ${d.level},
                ${d.gender}, ${d.plural}, ${d.root}, ${d.everyday_synonym},
                ${tx.json(translations)}, ${d.notes})
        on conflict (id) do update set
          hebrew = excluded.hebrew, hebrew_nikud = excluded.hebrew_nikud,
          part_of_speech = excluded.part_of_speech, level = excluded.level,
          gender = excluded.gender, plural = excluded.plural, root = excluded.root,
          everyday_synonym = excluded.everyday_synonym,
          translations = excluded.translations, notes = excluded.notes,
          updated_at = now()`;
    }
    for (const u of units) {
      const dialogue = u.dialogue
        .sort((a, b) => a.line_order - b.line_order)
        .map((l) => ({ order: l.line_order, speaker: l.speaker, he: l.he, translations: { en: l.en } }));
      await tx`
        insert into units (slug, level, display_order, status, title, dialogue)
        values (${u.slug}, ${u.level}, ${u.display_order}, ${u.status},
                ${tx.json({ en: u.title_en })}, ${tx.json(dialogue)})
        on conflict (slug) do update set
          level = excluded.level, display_order = excluded.display_order,
          status = excluded.status, title = excluded.title,
          dialogue = excluded.dialogue, updated_at = now()`;
      for (const it of u.items) {
        const ctx = [{ he: it.context_he, translations: { en: it.context_en } }];
        await tx`
          insert into unit_items (unit_slug, entry_id, display_order, context_sentences)
          values (${u.slug}, ${it.entry_id}, ${it.display_order}, ${tx.json(ctx)})
          on conflict (unit_slug, entry_id) do update set
            display_order = excluded.display_order,
            context_sentences = excluded.context_sentences`;
      }
    }
  });

  console.log(`dictionary_entries: ${dictionary.length} upserted`);
  for (const u of units) console.log(`unit ${u.slug}: 1 unit, ${u.items.length} items upserted`);
  await sql.end();
}

const isDirectRun = process.argv[1]?.endsWith('import-content.ts');
if (isDirectRun) {
  main().catch((e) => {
    console.error(String(e.message ?? e));
    process.exit(1);
  });
}
