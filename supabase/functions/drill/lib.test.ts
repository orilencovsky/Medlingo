import { assertEquals } from 'jsr:@std/assert';
import { validateBody, countLearnerTurns, isSessionStart } from './lib.ts';

Deno.test('validateBody accepts a well-formed session start', () => {
  const r = validateBody({ sessionId: crypto.randomUUID(), messages: [{ role: 'user', content: '' }] });
  assertEquals(r.ok, true);
});

Deno.test('validateBody rejects missing sessionId, bad roles, and >10 learner turns', () => {
  assertEquals(validateBody({ messages: [] }).ok, false);
  assertEquals(validateBody({ sessionId: 'x', messages: [{ role: 'system', content: 'hi' }] }).ok, false);
  const tooMany = Array.from({ length: 11 }, () => ({ role: 'user' as const, content: 'שלום' }));
  assertEquals(validateBody({ sessionId: crypto.randomUUID(), messages: tooMany }).ok, false);
});

Deno.test('countLearnerTurns counts only user messages', () => {
  assertEquals(countLearnerTurns([
    { role: 'user', content: '' }, { role: 'assistant', content: 'a' }, { role: 'user', content: 'b' },
  ]), 2);
});

Deno.test('isSessionStart is true only for a single empty user message', () => {
  assertEquals(isSessionStart([{ role: 'user', content: '' }]), true);
  assertEquals(isSessionStart([{ role: 'user', content: '' }, { role: 'assistant', content: 'x' }]), false);
});
