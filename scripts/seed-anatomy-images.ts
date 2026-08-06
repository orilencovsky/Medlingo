// scripts/seed-anatomy-images.ts
// Seeds anatomy images from repo files — both vetted open-license art (public-domain
// Gray's Anatomy plates, Wikimedia CC-BY, ...) and AI illustrations drawn out-of-band
// (an agent session with image tools; no runtime provider or API key exists). Reads a
// manifest TSV mapping each anatomy entry to a local image file, uploads the file to
// the `anatomy` storage bucket, and inserts an `anatomy_images` row.
//
// Source semantics: an `ai` image NEVER auto-publishes via the default — is_primary
// starts false and the expert approves it in /admin/anatomy (generated anatomy may be
// medically wrong). The manifest MAY set is_primary=true on any row, but that is an
// operator's deliberate per-row choice, never automatic.
//
// Manifest: content/anatomy-curated.tsv (override with --manifest <path>), columns:
//   entry_id   dictionary_entries.id (must exist and be topic='anatomy')
//   file       path to the local image, relative to the manifest's directory
//              (AI illustrations live in content/anatomy-images/<entry_id>.webp)
//   credit     attribution / license string. REQUIRED for source=curated (the DB
//              CHECK rejects an uncredited curated image); optional for source=ai.
//   is_primary optional "true"/"false" (default false). "true" makes this the
//              learner-visible image, clearing any existing primary for the entry.
//   source     optional "curated"/"ai" (default curated).
//
// Idempotent: the storage path is derived from source + entry_id + file basename (no
// timestamp), so re-running skips an image that is already uploaded+inserted,
// unless --regenerate re-uploads and re-links it.
//
// Usage:
//   npm run seed:anatomy-images                       # uses content/anatomy-curated.tsv
//   npm run seed:anatomy-images -- --manifest x.tsv   # custom manifest
//   npm run seed:anatomy-images -- --regenerate       # overwrite existing curated rows
import { readFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { parseTsv } from './tsv';

config({ path: '.env.local' });
config({ path: '.env.content' });

const url = process.env.VITE_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
};

// Deterministic per (entry_id, file) so re-runs are idempotent, and safe as an
// object key (strip anything outside [a-z0-9._-], lowercased).
function storagePathFor(entryId: string, file: string, source: 'curated' | 'ai'): string {
  const safeEntry = entryId.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  const safe = basename(file).toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  return `${safeEntry}/${source}-${safe}`;
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const regenerate = process.argv.includes('--regenerate');
  const manifestPath = resolve(argValue('--manifest') ?? 'content/anatomy-curated.tsv');
  const manifestDir = dirname(manifestPath);

  let rows: Array<Record<string, string>>;
  try {
    rows = parseTsv(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'ENOENT') {
      console.log(`No manifest at ${manifestPath}. Create one (columns: entry_id, file, credit, is_primary, source) then re-run. Nothing to do.`);
      return;
    }
    throw err;
  }

  if (rows.length === 0) {
    console.log(`Manifest ${manifestPath} has no data rows. Nothing to do.`);
    return;
  }

  let seeded = 0;
  let skipped = 0;
  let promoted = 0;

  for (const row of rows) {
    const entryId = row.entry_id;
    const wantPrimary = row.is_primary?.toLowerCase() === 'true';
    const source = (row.source?.toLowerCase() || 'curated') as 'curated' | 'ai';
    const credit = row.credit?.trim() ? row.credit.trim() : null;

    if (source !== 'curated' && source !== 'ai') {
      throw new Error(`manifest row for entry_id="${entryId}": source must be "curated" or "ai", got "${row.source}"`);
    }
    if (!entryId || !row.file) {
      throw new Error(`manifest row for entry_id="${entryId}": entry_id and file are required`);
    }
    if (source === 'curated' && !credit) {
      throw new Error(`manifest row for entry_id="${entryId}": credit is required for a curated image (the DB rejects an uncredited curated image)`);
    }

    // Confirm the entry exists and is actually an anatomy term.
    const { data: entry, error: entryErr } = await admin
      .from('dictionary_entries').select('id, topic').eq('id', entryId).single();
    if (entryErr || !entry) { console.log(`SKIP  ${entryId} — not found in dictionary_entries`); skipped++; continue; }
    if (entry.topic !== 'anatomy') {
      console.log(`SKIP  ${entryId} — topic is "${entry.topic ?? 'null'}", not 'anatomy'`); skipped++; continue;
    }

    const storagePath = storagePathFor(entryId, row.file, source);

    // Idempotency: a row of this source at this exact storage path already linked?
    // Scope to the row's source so a curated row never collides with an AI row
    // (defense-in-depth — storagePathFor already prefixes the source).
    const { data: existing } = await admin.from('anatomy_images')
      .select('id, is_primary').eq('entry_id', entryId).eq('storage_path', storagePath)
      .eq('source', source).limit(1);
    const already = existing?.[0];
    if (already && !regenerate) {
      // Still honour a primary promotion even when the image itself is unchanged.
      if (wantPrimary && !already.is_primary) {
        await setPrimary(entryId, already.id); promoted++;
        console.log(`PRIMARY ${entryId} -> ${storagePath} (already uploaded)`);
      } else {
        console.log(`SKIP  ${entryId} — ${storagePath} already seeded`);
        skipped++;
      }
      continue;
    }

    const absFile = resolve(manifestDir, row.file);
    let bytes: Buffer;
    try {
      bytes = readFileSync(absFile);
    } catch {
      throw new Error(`manifest row for ${entryId}: cannot read image file ${absFile}`);
    }
    const contentType = CONTENT_TYPES[extname(row.file).toLowerCase()];
    if (!contentType) {
      throw new Error(`manifest row for ${entryId}: unsupported image extension "${extname(row.file)}" (supported: ${Object.keys(CONTENT_TYPES).join(', ')})`);
    }

    const { error: uploadErr } = await admin.storage.from('anatomy')
      .upload(storagePath, bytes, { contentType, upsert: true });
    if (uploadErr) throw uploadErr;

    let imageId: string;
    if (already) {
      // --regenerate on an existing row: refresh its credit in place.
      const { data: updated, error: updErr } = await admin.from('anatomy_images')
        .update({ credit }).eq('id', already.id).select('id').single();
      if (updErr) throw updErr;
      imageId = updated.id;
    } else {
      const { data: inserted, error: insertErr } = await admin.from('anatomy_images')
        .insert({ entry_id: entryId, storage_path: storagePath, source, credit, is_primary: false })
        .select('id').single();
      if (insertErr) throw insertErr;
      imageId = inserted.id;
    }

    if (wantPrimary) { await setPrimary(entryId, imageId); promoted++; }

    console.log(`SEEDED ${entryId} -> ${storagePath}${wantPrimary ? ' (primary)' : ''}`);
    seeded++;
  }

  console.log(`\n${seeded} seeded, ${skipped} skipped, ${promoted} set as primary.`);
}

// Clear-then-set the single primary for an entry, respecting the partial unique
// index (anatomy_images_one_primary_per_entry). The set_primary_anatomy_image RPC
// can't be used here: it re-checks is_admin() via auth.uid(), which is null under
// the service-role key, so it would raise 'not authorized'. The service-role client
// bypasses RLS, so we enforce the single-primary invariant explicitly instead.
async function setPrimary(entryId: string, imageId: string): Promise<void> {
  const { error: clearErr } = await admin.from('anatomy_images')
    .update({ is_primary: false }).eq('entry_id', entryId).eq('is_primary', true);
  if (clearErr) throw clearErr;
  const { error: setErr } = await admin.from('anatomy_images')
    .update({ is_primary: true }).eq('id', imageId);
  if (setErr) throw setErr;
}

main();
