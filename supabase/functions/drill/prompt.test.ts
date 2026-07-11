import { assert, assertEquals } from 'jsr:@std/assert';
import { buildSystemPrompt, TOOLS } from './prompt.ts';

const words = [
  { id: 'keev', hebrew: 'כאב', en: 'pain' },
  { id: 'chom', hebrew: 'חום', en: 'fever' },
];

Deno.test('system prompt embeds the target words and the coaching duty', () => {
  const p = buildSystemPrompt(words);
  assert(p.includes('כאב'));
  assert(p.includes('give_feedback'));
  assert(p.includes('end_session'));
});

Deno.test('tools define give_feedback and end_session with per-word verdicts', () => {
  assertEquals(TOOLS.map((t) => t.name), ['give_feedback', 'end_session']);
  const verdictSchema = TOOLS[1].input_schema.properties.verdicts;
  assert(JSON.stringify(verdictSchema).includes('used_correctly'));
});
