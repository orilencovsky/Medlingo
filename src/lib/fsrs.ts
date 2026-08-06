import {
  fsrs, generatorParameters, createEmptyCard,
  Rating as FsrsRating, State, type Card, type Grade,
} from 'ts-fsrs';
import type { CardState, CardStateName, PracticeForm, Rating } from './types';

export const FSRS_DESIRED_RETENTION = 0.9;

export const EASY_LATENCY_MS: Record<Exclude<PracticeForm, 'drill'>, number> = {
  flashcard_recognition: 4000,
  cloze: 8000,
  flashcard_recall: 8000,
  image_recognition: 4000, // recognition-speed task: picking from 4 options
};

export const FORM_BANDS = { recognitionMaxStabilityDays: 3, clozeMaxStabilityDays: 10 };

const scheduler = fsrs(generatorParameters({
  enable_fuzz: false,
  request_retention: FSRS_DESIRED_RETENTION,
}));

const STATE_TO_NAME: Record<State, CardStateName> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};
const NAME_TO_STATE: Record<CardStateName, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};
const RATING_TO_FSRS: Record<Rating, FsrsRating> = {
  again: FsrsRating.Again,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
};

function fromCard(entryId: string, c: Card): CardState {
  return {
    entryId,
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    reps: c.reps,
    lapses: c.lapses,
    learningSteps: c.learning_steps ?? 0,
    state: STATE_TO_NAME[c.state],
    lastReview: c.last_review ? new Date(c.last_review) : null,
  };
}

function toCard(cs: CardState): Card {
  // elapsed_days/scheduled_days are reconstructed — not persisted in user_card_state
  const scheduledDays = cs.lastReview
    ? Math.max(0, Math.round((cs.due.getTime() - cs.lastReview.getTime()) / 86_400_000))
    : 0;
  return {
    due: cs.due,
    stability: cs.stability,
    difficulty: cs.difficulty,
    elapsed_days: 0,
    scheduled_days: scheduledDays,
    learning_steps: cs.learningSteps,
    reps: cs.reps,
    lapses: cs.lapses,
    state: NAME_TO_STATE[cs.state],
    last_review: cs.lastReview ?? undefined,
  } as Card;
}

export function newCardState(entryId: string, now: Date): CardState {
  return fromCard(entryId, createEmptyCard(now));
}

export function deriveRating(
  correct: boolean, latencyMs: number, form: Exclude<PracticeForm, 'drill'>,
): Rating {
  if (!correct) return 'again';
  return latencyMs <= EASY_LATENCY_MS[form] ? 'easy' : 'good';
}

export function applyReview(card: CardState, rating: Rating, now: Date): CardState {
  const result = scheduler.next(toCard(card), now, RATING_TO_FSRS[rating] as Grade);
  return fromCard(card.entryId, result.card);
}

export interface FormCapabilities { hasImage: boolean; hasContext: boolean; }

// Defaults replicate the pre-anatomy behavior (every unit card has contexts,
// none had images), so legacy callers keep byte-identical form selection.
export function selectForm(
  card: CardState,
  caps: FormCapabilities = { hasImage: false, hasContext: true },
): Exclude<PracticeForm, 'drill'> {
  const recognition = caps.hasImage ? 'image_recognition' : 'flashcard_recognition';
  if (card.stability < FORM_BANDS.recognitionMaxStabilityDays) return recognition;
  // A card with no context sentence can't cloze — repeat the recognition-band
  // form in the middle band instead of crashing the Cloze exercise.
  if (card.stability < FORM_BANDS.clozeMaxStabilityDays) {
    return caps.hasContext ? 'cloze' : recognition;
  }
  return 'flashcard_recall';
}

export function isDue(card: CardState, now: Date): boolean {
  return card.due.getTime() <= now.getTime();
}
