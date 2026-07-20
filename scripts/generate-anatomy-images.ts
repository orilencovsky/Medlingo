// scripts/generate-anatomy-images.ts
// Trial AI-image pipeline for the anatomy tab. Stages `source='ai', is_primary=false`
// candidates for a fixed trial list of ~10-15 terms so an expert can compare them
// against curated images in /admin/anatomy. NEVER sets a primary — an AI image is
// published only by explicit admin action (medical-accuracy caveat, see spec).
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env.content' });

const url = process.env.VITE_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// Trial set: 10-15 anatomy entry ids to compare AI generation against curated
// images before deciding whether to scale (spec: "curated-first ... trial set").
const TRIAL_ENTRY_IDS: string[] = [
  // Fill with real dictionary_entries.id values tagged topic='anatomy' before running,
  // e.g. 'heart', 'lung_left', 'femur', 'kidney', 'liver', ...
];

// Swap this for the actual image-generation call available at run time
// (spec: "pluggable"). Must return raw image bytes for one term.
async function generateImage(termEnglish: string): Promise<Buffer> {
  throw new Error(`generateImage() not wired up yet — no provider configured for "${termEnglish}"`);
}

async function main() {
  const regenerate = process.argv.includes('--regenerate');
  let staged = 0;
  let skipped = 0;

  for (const entryId of TRIAL_ENTRY_IDS) {
    const { data: entry, error: entryErr } = await admin
      .from('dictionary_entries').select('id, translations').eq('id', entryId).single();
    if (entryErr || !entry) { console.log(`SKIP  ${entryId} — not found`); skipped++; continue; }

    if (!regenerate) {
      const { data: existing } = await admin
        .from('anatomy_images').select('id').eq('entry_id', entryId).eq('source', 'ai').limit(1);
      if ((existing ?? []).length > 0) { console.log(`SKIP  ${entryId} — already has an ai candidate`); skipped++; continue; }
    }

    const termEnglish = (entry.translations as { en: string }).en;
    const bytes = await generateImage(termEnglish);
    const storagePath = `${entryId}/ai-${Date.now()}.png`;

    const { error: uploadErr } = await admin.storage.from('anatomy')
      .upload(storagePath, bytes, { contentType: 'image/png', upsert: regenerate });
    if (uploadErr) throw uploadErr;

    const { error: insertErr } = await admin.from('anatomy_images').insert({
      entry_id: entryId, storage_path: storagePath, source: 'ai', is_primary: false,
    });
    if (insertErr) throw insertErr;

    console.log(`STAGED ${entryId} -> ${storagePath}`);
    staged++;
  }

  console.log(`\n${staged} staged, ${skipped} skipped. No primary images were set — review in /admin/anatomy.`);
}
main();
