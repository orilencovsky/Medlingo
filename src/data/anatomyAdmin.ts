import { supabase } from '../lib/supabase';
import { fetchAllRows } from './fetchAll';
import { anatomyImageUrl } from './anatomyImages';
import { mapEntryRow, type EntryRow } from './entryMapper';
import type { Region } from '../lib/anatomyRegions';
import type { BodySystem } from '../lib/anatomySystems';
import type { DictionaryEntry } from '../lib/types';

export interface AnatomyImageAdmin {
  id: string; url: string; source: 'curated' | 'ai'; isPrimary: boolean; credit: string | null;
}

export interface AnatomyAdminEntry {
  entry: DictionaryEntry; region: Region | null; system: BodySystem | null; images: AnatomyImageAdmin[];
}

type AdminRow = EntryRow & {
  anatomy_terms: { region: Region; system: BodySystem } | null;
  anatomy_images: { id: string; storage_path: string; source: 'curated' | 'ai'; is_primary: boolean; credit: string | null }[] | null;
};

// Admin view of every anatomy word, including ones still missing region/system/
// a primary image — unlike fetchAnatomyCards, nothing here is filtered out.
export async function fetchAnatomyAdmin(): Promise<AnatomyAdminEntry[]> {
  const rows = await fetchAllRows<AdminRow>((from, to) =>
    supabase
      .from('dictionary_entries')
      .select('*, anatomy_terms(region, system), anatomy_images(id, storage_path, source, is_primary, credit)')
      .eq('topic', 'anatomy')
      .eq('is_deprecated', false)
      .range(from, to),
  );

  return rows.map((r) => ({
    entry: mapEntryRow(r),
    region: r.anatomy_terms?.region ?? null,
    system: r.anatomy_terms?.system ?? null,
    images: (r.anatomy_images ?? []).map((img) => ({
      id: img.id, url: anatomyImageUrl(img.storage_path), source: img.source,
      isPrimary: img.is_primary, credit: img.credit,
    })),
  }));
}

// Direct write, like setTopic in reviewConsole.ts — region/system assignment is
// operational metadata, not moderated content, so it bypasses entry_edits.
export async function setAnatomyMeta(entryId: string, region: Region, system: BodySystem): Promise<void> {
  const { error } = await supabase
    .from('anatomy_terms')
    .upsert({ entry_id: entryId, region, system }, { onConflict: 'entry_id' });
  if (error) throw error;
}

export async function setPrimaryImage(imageId: string): Promise<void> {
  const { error } = await supabase.rpc('set_primary_anatomy_image', { image_id: imageId });
  if (error) throw error;
}
