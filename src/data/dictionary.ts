import { supabase } from '../lib/supabase';
import { fetchAllRows } from './fetchAll';
import { mapEntryRow, type EntryRow } from './entryMapper';
import type { DictionaryEntry } from '../lib/types';

export async function fetchDictionary(): Promise<DictionaryEntry[]> {
  const rows = await fetchAllRows<EntryRow>((from, to) =>
    supabase
      .from('dictionary_entries')
      .select('*')
      .eq('is_deprecated', false)
      .order('hebrew', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  );
  return rows.map(mapEntryRow);
}

export function filterEntries(entries: DictionaryEntry[], query: string): DictionaryEntry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return entries;
  return entries.filter((e) => {
    const haystack = [
      e.hebrew, e.hebrewNikud, e.everydaySynonym ?? '',
      e.translations.en, e.translations.ar ?? '', e.translations.ru ?? '', e.translations.fr ?? '',
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}
