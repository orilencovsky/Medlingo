import { assert, assertEquals } from 'jsr:@std/assert';
import { handleDrillRequest, handler } from './handler.ts';
import type { DrillBody } from './lib.ts';

// ---- CORS / preflight ------------------------------------------------------
//
// The SPA calls this function cross-origin (https://medlingo.pages.dev,
// http://localhost:5173) with Authorization + Content-Type headers, which
// triggers a browser preflight OPTIONS request. These tests exercise the
// exported `handler` directly (no real network/env access on these paths).

Deno.test('OPTIONS request is answered directly with 200 and CORS headers', async () => {
  const req = new Request('https://example.com/functions/v1/drill', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://medlingo.pages.dev',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, content-type',
    },
  });
  const res = await handler(req);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert(res.headers.get('Access-Control-Allow-Headers')?.includes('authorization'));
  assert(res.headers.get('Access-Control-Allow-Methods')?.includes('POST'));
  await res.text();
});

Deno.test('a disallowed method still gets CORS headers on its error response', async () => {
  const req = new Request('https://example.com/functions/v1/drill', { method: 'GET' });
  const res = await handler(req);
  assertEquals(res.status, 405);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');
  await res.text();
});

// ---- DB error surfacing (Finding 2, handler.ts side) ------------------------
//
// `handleDrillRequest` holds the post-auth logic (quota check + dispatch to
// runDrill) extracted out of `handler` so it can be exercised with an
// injected fake service, the same way claude.test.ts exercises `runDrill` —
// no real Supabase/network access needed.

// deno-lint-ignore no-explicit-any
function fakeServiceWithDbError(): any {
  return {
    from(table: string) {
      if (table === 'drill_usage') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              eq: (_col: string, _val: string) => ({
                maybeSingle: () => Promise.resolve({ data: null }),
              }),
            }),
          }),
          upsert: (_row: unknown, _opts: unknown) => Promise.resolve({}),
        };
      }
      if (table === 'user_card_state') {
        // Simulates a real DB error, distinct from "no due cards" (data: []).
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              lte: (_col: string, _val: string) => ({
                limit: (_n: number) => Promise.resolve({ data: null, error: { message: 'connection refused' } }),
              }),
            }),
          }),
        };
      }
      throw new Error(`fakeServiceWithDbError: unexpected table "${table}"`);
    },
  };
}

Deno.test('handleDrillRequest returns 500 with CORS headers (not a misleading 400) when loadTargetWords hits a DB error', async () => {
  const service = fakeServiceWithDbError();
  const body: DrillBody = { sessionId: crypto.randomUUID(), messages: [{ role: 'user', content: '' }] };
  const res = await handleDrillRequest(body, { id: 'user-1' }, service);
  assertEquals(res.status, 500);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');
  await res.text();
});

Deno.test('handleDrillRequest returns 429 with CORS headers once the daily session quota is exhausted', async () => {
  // deno-lint-ignore no-explicit-any
  const service: any = {
    from(table: string) {
      if (table !== 'drill_usage') throw new Error(`unexpected table "${table}"`);
      return {
        select: (_cols: string) => ({
          eq: (_col: string, _val: string) => ({
            eq: (_col: string, _val: string) => ({
              maybeSingle: () => Promise.resolve({ data: { sessions_started: 3 } }),
            }),
          }),
        }),
        upsert: (_row: unknown, _opts: unknown) => {
          throw new Error('upsert must not be called once quota is exhausted');
        },
      };
    },
  };
  const body: DrillBody = { sessionId: crypto.randomUUID(), messages: [{ role: 'user', content: '' }] };
  const res = await handleDrillRequest(body, { id: 'user-1' }, service);
  assertEquals(res.status, 429);
  assertEquals(await res.text(), 'quota exhausted');
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');
});
