import { TOPICS, isTopic, type Topic } from '../src/lib/topics';

// Extract exactly one known slug from the model's reply; null if none or ambiguous.
export function parseTopicResponse(text: string): Topic | null {
  const norm = text.trim().toLowerCase();
  if (norm === '') return null;
  if (isTopic(norm)) return norm;
  const found = TOPICS.filter((t) => new RegExp(`\\b${t}\\b`).test(norm));
  return found.length === 1 ? found[0] : null;
}

export async function classify(hebrew: string, en: string, notes: string | null): Promise<Topic | null> {
  const list = TOPICS.join(', ');
  const prompt =
    `Classify this Hebrew medical term into exactly ONE topic from this fixed list:\n${list}\n\n` +
    `Term (Hebrew): ${hebrew}\nEnglish: ${en}\n${notes ? `Notes: ${notes}\n` : ''}` +
    `Reply with ONLY the single topic slug from the list — no other words.`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 64,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.error?.message ?? JSON.stringify(body) ?? '(no body)';
    throw new Error(`anthropic ${res.status}: ${detail}`);
  }
  const json = await res.json();
  return parseTopicResponse(json.content?.[0]?.text ?? '');
}

async function main() {
  const { config } = await import('dotenv');
  config({ path: '.env.content' });
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.DATABASE_URL!);

  const rows = await sql<{ id: string; hebrew: string; en: string; notes: string | null }[]>`
    select id, hebrew, translations->>'en' as en, notes
    from dictionary_entries
    where topic is null and is_deprecated = false
    order by id`;
  console.log(`classifying ${rows.length} untagged entries`);

  let tagged = 0, skipped = 0;
  for (const r of rows) {
    const topic = await classify(r.hebrew, r.en, r.notes);
    if (topic) {
      await sql`update dictionary_entries set topic = ${topic}, updated_at = now() where id = ${r.id}`;
      tagged++;
    } else {
      console.warn(`  no confident topic for ${r.id} (${r.hebrew}) — left null`);
      skipped++;
    }
  }
  console.log(`done: ${tagged} tagged, ${skipped} left null`);
  await sql.end();
}

const isDirectRun = process.argv[1]?.endsWith('suggest-topics.ts');
if (isDirectRun) {
  main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
