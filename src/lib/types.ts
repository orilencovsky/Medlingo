export interface Profile {
  userId: string;
  displayName: string;
  uiLanguage: string;
  isAdmin: boolean;
  canApprove: boolean;
  streakCurrent: number;
  streakLongest: number;
  lastActiveDate: string | null; // 'YYYY-MM-DD'
}

export type PracticeForm =
  | 'flashcard_recognition' | 'flashcard_recall' | 'cloze' | 'drill' | 'image_recognition';
export type Rating = 'again' | 'good' | 'easy';
export type CardStateName = 'new' | 'learning' | 'review' | 'relearning';
export type PartOfSpeech =
  | 'noun' | 'verb' | 'adjective' | 'phrase' | 'abbreviation'
  | 'adverb' | 'pronoun' | 'preposition' | 'conjunction' | 'numeral' | 'interjection' | 'particle';

// Optional "study area" tag on a dictionary entry. `medical_loanword` marks a
// widely-used foreign-origin clinical term written in Hebrew script (ספסיס,
// קרפיטציות). Extend alongside the DB check constraint + import zod enum.
export type EntryCategory = 'medical_loanword';

export interface Translations { en: string; ar?: string | null; ru?: string | null; fr?: string | null; }

export interface DictionaryEntry {
  id: string;
  hebrew: string;
  hebrewNikud: string;
  partOfSpeech: PartOfSpeech;
  level: 1 | 2 | 3;
  gender: 'ז' | 'נ' | null;
  plural: string | null;
  root: string | null;
  everydaySynonym: string | null;
  translations: Translations;
  notes: string | null;
  category: EntryCategory | null;
  topic: import('./topics').Topic | null;
}

export interface ContextSentence { he: string; translations: Translations; }
export interface DialogueLine { order: number; speaker: string; he: string; translations: Translations; }

export interface Unit {
  slug: string;
  level: 1 | 2 | 3;
  displayOrder: number;
  status: 'draft' | 'published';
  title: Translations;
  dialogue: DialogueLine[];
}

export interface UnitItem { entryId: string; displayOrder: number; contextSentences: ContextSentence[]; }

export interface CardState {
  entryId: string;
  due: Date;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  learningSteps: number; // ts-fsrs internal step counter — must round-trip or lapsed learning cards graduate early
  state: CardStateName;
  lastReview: Date | null;
}

export interface ReviewCard {
  card: CardState;
  entry: DictionaryEntry;
  contextSentences: ContextSentence[];
  imageUrl: string | null; // primary anatomy image, when the entry has one
}

export type ReviewState = 'unreviewed' | 'reviewed' | 'edit_pending';

export interface AdminEntry extends DictionaryEntry {
  reviewState: ReviewState;
  reviewPriority: number;
  isDeprecated: boolean;
}

export interface EntryPayload {
  id?: string;
  hebrew: string; hebrew_nikud: string; part_of_speech: PartOfSpeech;
  level: number; gender: string | null; plural: string | null; root: string | null;
  everyday_synonym: string | null; translations: Translations; notes: string | null;
  category: string | null;
}

export interface EntryEdit {
  id: string;
  entryId: string | null;
  changeType: 'create' | 'update' | 'delete';
  payload: EntryPayload;
  editorId: string;
  editorNote: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}
