export type DrillMessage = { role: 'user' | 'assistant'; content: string };
export type DrillBody = { sessionId: string; messages: DrillMessage[] };

const MAX_LEARNER_TURNS = 10;

export function countLearnerTurns(messages: DrillMessage[]): number {
  return messages.filter((m) => m.role === 'user').length;
}

export function isSessionStart(messages: DrillMessage[]): boolean {
  return messages.length === 1 && messages[0].role === 'user' && messages[0].content === '';
}

export function validateBody(raw: unknown): { ok: true; body: DrillBody } | { ok: false; reason: string } {
  const b = raw as Partial<DrillBody>;
  if (typeof b?.sessionId !== 'string' || b.sessionId.length < 8) return { ok: false, reason: 'bad sessionId' };
  if (!Array.isArray(b.messages) || b.messages.length === 0) return { ok: false, reason: 'bad messages' };
  for (const m of b.messages) {
    if (m === null || typeof m !== 'object') return { ok: false, reason: 'bad message' };
    if (m.role !== 'user' && m.role !== 'assistant') return { ok: false, reason: 'bad role' };
    if (typeof m.content !== 'string' || m.content.length > 2000) return { ok: false, reason: 'bad content' };
  }
  if (countLearnerTurns(b.messages) > MAX_LEARNER_TURNS) return { ok: false, reason: 'too many turns' };
  return { ok: true, body: b as DrillBody };
}
