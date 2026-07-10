import type { DictionaryEntry } from './types';

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickDistractors(
  answer: DictionaryEntry,
  pool: DictionaryEntry[],
  n = 3,
  rng: () => number = Math.random,
): DictionaryEntry[] {
  const usable = pool.filter(
    (e) => e.id !== answer.id && e.translations.en !== answer.translations.en,
  );
  const tiers = [
    usable.filter((e) => e.level === answer.level && e.partOfSpeech === answer.partOfSpeech),
    usable.filter((e) => e.level === answer.level && e.partOfSpeech !== answer.partOfSpeech),
    usable.filter((e) => e.level !== answer.level),
  ];
  const picked: DictionaryEntry[] = [];
  const seenMeanings = new Set([answer.translations.en]);
  for (const tier of tiers) {
    for (const e of shuffle(tier, rng)) {
      if (picked.length >= n) break;
      if (seenMeanings.has(e.translations.en)) continue;
      picked.push(e);
      seenMeanings.add(e.translations.en);
    }
  }
  return picked;
}
