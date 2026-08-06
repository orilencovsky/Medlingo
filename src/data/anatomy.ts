import { supabase } from '../lib/supabase';
import { fetchAllRows } from './fetchAll';
import { anatomyImageUrl } from './anatomyImages';
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
      imageUrl: anatomyImageUrl(primary.storage_path),
      imageCredit: primary.credit,
    });
  }
  return cards;
}
