import { supabase } from '../lib/supabase';
import type { DictionaryEntry, Unit, UnitItem } from '../lib/types';

type UnitRow = {
  slug: string; level: 1 | 2 | 3; display_order: number;
  status: 'draft' | 'published'; title: Unit['title']; dialogue: Unit['dialogue'];
};
type ItemRow = {
  unit_slug: string; entry_id: string; display_order: number;
  context_sentences: UnitItem['contextSentences'];
};
type EntryRow = Parameters<typeof mapEntry>[0];

function mapUnit(r: UnitRow): Unit {
  return {
    slug: r.slug, level: r.level, displayOrder: r.display_order,
    status: r.status, title: r.title, dialogue: r.dialogue,
  };
}
function mapEntry(r: {
  id: string; hebrew: string; hebrew_nikud: string;
  part_of_speech: DictionaryEntry['partOfSpeech']; level: 1 | 2 | 3;
  gender: 'ז' | 'נ' | null; plural: string | null; root: string | null;
  everyday_synonym: string | null; translations: DictionaryEntry['translations']; notes: string | null;
  category: DictionaryEntry['category'];
}): DictionaryEntry {
  return {
    id: r.id, hebrew: r.hebrew, hebrewNikud: r.hebrew_nikud, partOfSpeech: r.part_of_speech,
    level: r.level, gender: r.gender, plural: r.plural, root: r.root,
    everydaySynonym: r.everyday_synonym, translations: r.translations, notes: r.notes,
    category: r.category ?? null,
  };
}

async function currentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');
  return user.id;
}

export async function loadUnits(): Promise<Unit[]> {
  const { data, error } = await supabase.from('units').select('*').order('display_order');
  if (error) throw error;
  return ((data ?? []) as UnitRow[]).map(mapUnit);
}

export async function loadUnit(slug: string) {
  const { data: unitRow, error: e1 } = await supabase
    .from('units').select('*').eq('slug', slug).maybeSingle();
  if (e1) throw e1;
  if (!unitRow) throw new Error(`unit not found: ${slug}`);
  const { data: itemRows, error: e2 } = await supabase
    .from('unit_items').select('*').eq('unit_slug', slug).order('display_order');
  if (e2) throw e2;
  const items = (itemRows ?? []) as ItemRow[];
  const { data: entryRows, error: e3 } = await supabase
    .from('dictionary_entries').select('*').in('id', items.map((i) => i.entry_id));
  if (e3) throw e3;
  const entries = new Map(((entryRows ?? []) as EntryRow[]).map((r) => [r.id, mapEntry(r)]));
  return {
    unit: mapUnit(unitRow as UnitRow),
    items: items
      .filter((i) => entries.has(i.entry_id))
      .map((i) => ({
        entryId: i.entry_id, displayOrder: i.display_order,
        contextSentences: i.context_sentences, entry: entries.get(i.entry_id)!,
      })),
  };
}

export async function loadUnitProgress(slug: string) {
  const { data, error } = await supabase
    .from('unit_progress').select('status').eq('unit_slug', slug).maybeSingle();
  if (error) throw error;
  return (data?.status ?? 'not_started') as 'not_started' | 'in_progress' | 'completed';
}

export async function startUnit(slug: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('unit_progress').upsert(
    { user_id: userId, unit_slug: slug, status: 'in_progress' },
    { onConflict: 'user_id,unit_slug', ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function completeUnit(slug: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('unit_progress').upsert(
    { user_id: userId, unit_slug: slug, status: 'completed', completed_at: new Date().toISOString() },
    { onConflict: 'user_id,unit_slug' },
  );
  if (error) throw error;
}

export async function loadUnitEntryIds(): Promise<Record<string, string[]>> {
  const { data, error } = await supabase
    .from('unit_items').select('unit_slug, entry_id');
  if (error) throw error;
  const map: Record<string, string[]> = {};
  for (const row of (data ?? []) as { unit_slug: string; entry_id: string }[]) {
    (map[row.unit_slug] ??= []).push(row.entry_id);
  }
  return map;
}
