import { supabase } from '../lib/supabase';
import { applyReview, deriveRating, isDue, newCardState } from '../lib/fsrs';
import { mapEntryRow, type EntryRow } from './entryMapper';
import type {
  CardState, ContextSentence, DictionaryEntry, PracticeForm, Rating, ReviewCard,
} from '../lib/types';

const QUEUE_KEY = 'medlingo.pendingReviews';

type CardRow = {
  entry_id: string; due: string; stability: number; difficulty: number;
  reps: number; lapses: number; learning_steps?: number;
  state: CardState['state']; last_review: string | null;
};

function mapCardRow(r: CardRow): CardState {
  return {
    entryId: r.entry_id, due: new Date(r.due), stability: r.stability,
    difficulty: r.difficulty, reps: r.reps, lapses: r.lapses,
    learningSteps: r.learning_steps ?? 0, state: r.state,
    lastReview: r.last_review ? new Date(r.last_review) : null,
  };
}

function cardStateToRow(userId: string, c: CardState) {
  return {
    user_id: userId, entry_id: c.entryId, due: c.due.toISOString(),
    stability: c.stability, difficulty: c.difficulty, reps: c.reps, lapses: c.lapses,
    learning_steps: c.learningSteps,
    state: c.state, last_review: c.lastReview ? c.lastReview.toISOString() : null,
    updated_at: new Date().toISOString(),
  };
}

async function currentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');
  return user.id;
}

export async function loadAllCards(): Promise<CardState[]> {
  const { data, error } = await supabase.from('user_card_state').select('*');
  if (error) throw error;
  return ((data ?? []) as CardRow[]).map(mapCardRow);
}

async function joinCards(cards: CardState[]): Promise<ReviewCard[]> {
  if (cards.length === 0) return [];
  const ids = cards.map((c) => c.entryId);
  const { data: entryRows, error: e1 } = await supabase
    .from('dictionary_entries').select('*').in('id', ids);
  if (e1) throw e1;
  const { data: itemRows, error: e2 } = await supabase
    .from('unit_items').select('*').in('entry_id', ids);
  if (e2) throw e2;
  const entries = new Map(((entryRows ?? []) as EntryRow[]).map((r) => [r.id, mapEntryRow(r)]));
  const contexts = new Map<string, ContextSentence[]>();
  for (const r of (itemRows ?? []) as Array<{ entry_id: string; context_sentences: ContextSentence[] }>) {
    contexts.set(r.entry_id, r.context_sentences);
  }
  return cards
    .filter((c) => entries.has(c.entryId))
    .map((c) => ({ card: c, entry: entries.get(c.entryId)!, contextSentences: contexts.get(c.entryId) ?? [] }));
}

export async function loadDueCards(now: Date = new Date()): Promise<ReviewCard[]> {
  const all = await loadAllCards();
  const due = all.filter((c) => isDue(c, now)).sort((a, b) => a.due.getTime() - b.due.getTime());
  return joinCards(due);
}

export async function loadUpcomingCards(limit: number): Promise<ReviewCard[]> {
  const all = await loadAllCards();
  const upcoming = all.sort((a, b) => a.due.getTime() - b.due.getTime()).slice(0, limit);
  return joinCards(upcoming);
}

export async function loadEntryPool(): Promise<DictionaryEntry[]> {
  const { data, error } = await supabase.from('dictionary_entries').select('*');
  if (error) throw error;
  return ((data ?? []) as EntryRow[]).map(mapEntryRow);
}

export async function seedNewCards(entryIds: string[], now: Date = new Date()): Promise<void> {
  const userId = await currentUserId();
  for (const entryId of entryIds) {
    const { error } = await supabase.from('user_card_state').upsert(
      cardStateToRow(userId, newCardState(entryId, now)),
      { onConflict: 'user_id,entry_id', ignoreDuplicates: true },
    );
    if (error) throw error;
  }
}

export interface ReviewInput {
  entryId: string;
  form: PracticeForm;
  correct: boolean;
  latencyMs: number;
  countsForScheduling?: boolean;
}

async function findCard(entryId: string, now: Date): Promise<CardState> {
  const all = await loadAllCards();
  return all.find((c) => c.entryId === entryId) ?? newCardState(entryId, now);
}

function ratingFor(input: ReviewInput): Rating {
  if (input.form === 'drill') return input.correct ? 'good' : 'again';
  return deriveRating(input.correct, input.latencyMs, input.form);
}

async function writeReview(input: ReviewInput, now: Date): Promise<CardState> {
  const userId = await currentUserId();
  const counts = input.countsForScheduling !== false;
  const card = await findCard(input.entryId, now);
  const rating = ratingFor(input);
  const next = counts ? applyReview(card, rating, now) : card;

  const { error: logError } = await supabase.from('review_logs').insert({
    user_id: userId, entry_id: input.entryId, reviewed_at: now.toISOString(),
    practice_form: input.form, rating, latency_ms: Math.round(input.latencyMs),
    counts_for_scheduling: counts,
  });
  if (logError) throw logError;

  if (counts) {
    const { error: stateError } = await supabase
      .from('user_card_state')
      .upsert(cardStateToRow(userId, next), { onConflict: 'user_id,entry_id' });
    if (stateError) throw stateError;
  }
  return next;
}

type QueuedReview = { input: ReviewInput; at: string; attempts?: number };

function readQueue(): QueuedReview[] {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as QueuedReview[];
}
function writeQueue(q: QueuedReview[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export async function submitReview(input: ReviewInput, now: Date = new Date()): Promise<CardState> {
  try {
    return await writeReview(input, now);
  } catch {
    writeQueue([...readQueue(), { input, at: now.toISOString() }]);
    const card = await findCard(input.entryId, now).catch(() => newCardState(input.entryId, now));
    return input.countsForScheduling !== false ? applyReview(card, ratingFor(input), now) : card;
  }
}

const MAX_FLUSH_ATTEMPTS = 3;

export async function flushPendingReviews(): Promise<number> {
  const queue = readQueue();
  const remaining: QueuedReview[] = [];
  let flushed = 0;
  let stopped = false;
  for (const q of queue) {
    if (stopped) {
      remaining.push(q);
      continue;
    }
    try {
      await writeReview(q.input, new Date(q.at));
      flushed++;
    } catch {
      const attempts = (q.attempts ?? 0) + 1;
      if (attempts >= MAX_FLUSH_ATTEMPTS) {
        // permanently-failing item (e.g. validation error) must not block the queue forever
        console.warn('medlingo: dropping review that failed to flush', q.input.entryId);
      } else {
        remaining.push({ ...q, attempts });
      }
      stopped = true; // preserve order — retry the rest on the next flush
    }
  }
  writeQueue(remaining);
  return flushed;
}
