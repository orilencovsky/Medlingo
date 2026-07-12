import type { CardState, Unit } from '../lib/types';

export const KNOWN_STABILITY_DAYS = 7;

export interface OverallProgress {
  total: number;
  covered: number;
  mastered: number;
  coveredPct: number;
  masteredPct: number;
}

export function computeOverallProgress(
  units: Unit[],
  cards: CardState[],
  entryIds: Record<string, string[]>,
): OverallProgress {
  const publishedIds = new Set<string>();
  for (const unit of units) {
    if (unit.status !== 'published') continue;
    for (const id of entryIds[unit.slug] ?? []) publishedIds.add(id);
  }

  const cardById = new Map(cards.map((c) => [c.entryId, c]));
  let covered = 0;
  let mastered = 0;
  for (const id of publishedIds) {
    const card = cardById.get(id);
    if (!card || card.reps === 0) continue;
    covered += 1;
    if (card.state === 'review' && card.stability >= KNOWN_STABILITY_DAYS) mastered += 1;
  }

  const total = publishedIds.size;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((100 * n) / total));
  return { total, covered, mastered, coveredPct: pct(covered), masteredPct: pct(mastered) };
}
