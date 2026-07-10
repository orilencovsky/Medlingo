export interface Profile {
  userId: string;
  displayName: string;
  uiLanguage: string;
  isAdmin: boolean;
  streakCurrent: number;
  streakLongest: number;
  lastActiveDate: string | null; // 'YYYY-MM-DD'
}

export type PracticeForm = 'flashcard_recognition' | 'flashcard_recall' | 'cloze' | 'drill';
export type Rating = 'again' | 'good' | 'easy';
export type CardStateName = 'new' | 'learning' | 'review' | 'relearning';
export type PartOfSpeech = 'noun' | 'verb' | 'adjective' | 'phrase' | 'abbreviation';

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

export interface ReviewCard { card: CardState; entry: DictionaryEntry; contextSentences: ContextSentence[]; }
