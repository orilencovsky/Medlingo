import { supabase } from '../lib/supabase';
import { fetchAllRows } from './fetchAll';
import { mapEntryRow, type EntryRow } from './entryMapper';
import type { Region } from '../lib/anatomyRegions';
import type { BodySystem } from '../lib/anatomySystems';
import type { DictionaryEntry } from '../lib/types';

export interface AnatomyCard {
  entry: DictionaryEntry;
  region: Region;
  system: BodySystem;
  imageUrl: string;
  imageCredit: string | null;
}

type AnatomyImageRow = {
  id: string; storage_path: string; source: 'curated' | 'ai';
  is_primary: boolean; credit: string | null;
};

type AnatomyTermRow = {
  entry_id: string; region: Region | null; system: BodySystem | null; display_order: number;
  dictionary_entries: EntryRow | null;
  anatomy_images: AnatomyImageRow[] | null;
};

function publicImageUrl(storagePath: string): string {
  return supabase.storage.from('anatomy').getPublicUrl(storagePath).data.publicUrl;
}

// Only terms with a region, a system, and a primary image are learner-visible —
// half-built terms (still being tagged/imaged in /admin/anatomy) stay hidden.
export async function fetchAnatomyCards(): Promise<AnatomyCard[]> {
  const rows = await fetchAllRows<AnatomyTermRow>((from, to) =>
    supabase
      .from('anatomy_terms')
      .select('entry_id, region, system, display_order, dictionary_entries(*), anatomy_images(id, storage_path, source, is_primary, credit)')
      .order('display_order', { ascending: true })
      .order('entry_id', { ascending: true })
      .range(from, to)
      .returns<AnatomyTermRow[]>(),
  );

  const cards: AnatomyCard[] = [];
  for (const row of rows) {
    // dictionary_entries RLS (`using (is_deprecated = false or is_admin())`) returns
    // null for the embedded row when a term's entry is deprecated/hidden from non-admins,
    // so this guard also drops those deprecated/hidden entries for real learners.
    if (!row.region || !row.system || !row.dictionary_entries) continue;
    const primary = (row.anatomy_images ?? []).find((img) => img.is_primary);
    if (!primary) continue;
    cards.push({
      entry: mapEntryRow(row.dictionary_entries),
      region: row.region,
      system: row.system,
      imageUrl: publicImageUrl(primary.storage_path),
      imageCredit: primary.credit,
    });
  }
  return cards;
}

export interface AnatomyWord {
  entry: DictionaryEntry;
  imageUrl: string | null;
  imageCredit: string | null;
}

type WordRow = EntryRow & {
  anatomy_images: { storage_path: string; is_primary: boolean; credit: string | null }[] | null;
};

// One anatomy word by id, with its primary image if it has one. Returns null when
// the entry doesn't exist or isn't readable. The image is optional: the detail card
// still opens for a word with no primary image (text-only).
export async function fetchAnatomyWord(entryId: string): Promise<AnatomyWord | null> {
  const { data, error } = await supabase
    .from('dictionary_entries')
    .select('*, anatomy_images(storage_path, is_primary, credit)')
    .eq('id', entryId)
    .maybeSingle<WordRow>();
  if (error) throw error;
  if (!data) return null;
  const primary = (data.anatomy_images ?? []).find((img) => img.is_primary);
  return {
    entry: mapEntryRow(data),
    imageUrl: primary ? publicImageUrl(primary.storage_path) : null,
    imageCredit: primary?.credit ?? null,
  };
}

// Lightweight labels (nikud Hebrew + English) for a set of entry ids — used for the
// hover label + aria-label on figure regions without fetching whole words.
export async function fetchSceneLabels(entryIds: string[]): Promise<Record<string, { he: string; en: string }>> {
  if (entryIds.length === 0) return {};
  const { data, error } = await supabase
    .from('dictionary_entries')
    .select('id, hebrew_nikud, translations')
    .in('id', entryIds);
  if (error) throw error;
  const out: Record<string, { he: string; en: string }> = {};
  for (const r of (data ?? []) as { id: string; hebrew_nikud: string; translations: { en: string } }[]) {
    out[r.id] = { he: r.hebrew_nikud, en: r.translations.en };
  }
  return out;
}
