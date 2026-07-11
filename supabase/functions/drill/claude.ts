import type { DrillBody } from './lib.ts';
export function runDrill(_body: DrillBody, _userId: string, _service: unknown): Response {
  return new Response('event: done\ndata: {}\n\n', {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
