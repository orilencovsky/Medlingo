import { describe, it, expect } from 'vitest';
import { serializeDictionary } from './export-content';
import { validateDictionary } from './import-content';

describe('serializeDictionary', () => {
  it('is the inverse of validateDictionary (round-trip identity)', () => {
    const rows = [
      { id: 'a', hebrew: 'חום', hebrew_nikud: 'חוֹם', part_of_speech: 'noun' as const, level: 2,
        gender: 'ז' as const, plural: null, root: null, everyday_synonym: null,
        en: 'fever', ar: null, ru: null, fr: null, notes: null, category: null },
      { id: 'b', hebrew: 'ספסיס', hebrew_nikud: 'סֶפְּסִיס', part_of_speech: 'noun' as const, level: 2,
        gender: 'ז' as const, plural: null, root: null, everyday_synonym: 'זיהום בדם',
        en: 'sepsis', ar: null, ru: null, fr: null, notes: 'loanword', category: 'medical_loanword' as const },
    ];
    const tsv = serializeDictionary(rows);
    expect(validateDictionary(tsv, 'roundtrip')).toEqual(rows);
  });
  it('emits the fixed 15-column header', () => {
    expect(serializeDictionary([]).trim()).toBe(
      'id\thebrew\thebrew_nikud\tpart_of_speech\tlevel\tgender\tplural\troot\teveryday_synonym\ten\tar\tru\tfr\tnotes\tcategory');
  });
});
