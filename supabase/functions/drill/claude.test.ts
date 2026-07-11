import { assert, assertEquals } from 'jsr:@std/assert';
import { runDrill } from './claude.ts';
import type { DrillBody } from './lib.ts';

// ---- test doubles -----------------------------------------------------
//
// claude.ts must never touch the network or a real database in tests. These
// helpers stub `globalThis.fetch` (standing in for the Anthropic API) and
// build a minimal fake Supabase service client that mirrors exactly the
// `.from(table).select(...).eq(...)...` chains `loadTargetWords` calls —
// nothing more, so a chain-shape change in claude.ts should break these
// tests rather than pass silently against an over-permissive mock.

type Entry = { id: string; hebrew: string; translations: { en: string } };

function fakeService(opts: {
  due?: Array<{ entry_id: string }>;
  recent?: Array<{ entry_id: string }>;
  entries?: Entry[];
  onDictionaryIds?: (ids: string[]) => void;
  // deno-lint-ignore no-explicit-any
}): any {
  const due = opts.due ?? [];
  const recent = opts.recent ?? [];
  const entries = opts.entries ?? [];
  return {
    from(table: string) {
      if (table === 'user_card_state') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              lte: (_col: string, _val: string) => ({
                limit: (_n: number) => Promise.resolve({ data: due }),
              }),
            }),
          }),
        };
      }
      if (table === 'review_logs') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              order: (_col: string, _opts: { ascending: boolean }) => ({
                limit: (_n: number) => Promise.resolve({ data: recent }),
              }),
            }),
          }),
        };
      }
      if (table === 'dictionary_entries') {
        return {
          select: (_cols: string) => ({
            in: (_col: string, ids: string[]) => {
              opts.onDictionaryIds?.(ids);
              return Promise.resolve({ data: entries.filter((e) => ids.includes(e.id)) });
            },
          }),
        };
      }
      throw new Error(`fakeService: unexpected table "${table}"`);
    },
  };
}

/** Builds a fake `fetch("https://api.anthropic.com/v1/messages", ...)` response. */
function fakeUpstream(chunks: string[], opts: { ok?: boolean; status?: number } = {}): Response {
  const ok = opts.ok ?? true;
  if (!ok) return new Response('upstream error', { status: opts.status ?? 500 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: opts.status ?? 200 });
}

function sseLine(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

type CapturedRequest = { url: string; body: Record<string, unknown> | undefined };

/**
 * Stubs both `globalThis.fetch` (the Anthropic call) and `Deno.env.get` (the
 * `ANTHROPIC_API_KEY` read that immediately precedes it) as one unit — the
 * bare `deno test supabase/functions/drill/` invocation this project uses
 * has no `--allow-env`, so even a fully-mocked fetch call would otherwise
 * throw `NotCapable` on the `Deno.env.get('ANTHROPIC_API_KEY')!` line before
 * ever reaching it. Always `restore()` in a finally.
 */
function stubFetch(makeResponse: () => Response) {
  const originalFetch = globalThis.fetch;
  const originalEnvGet = Deno.env.get;
  const calls: CapturedRequest[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return Promise.resolve(makeResponse());
  }) as unknown as typeof fetch;
  Deno.env.get = ((key: string) => (key === 'ANTHROPIC_API_KEY' ? 'test-anthropic-key' : undefined)) as typeof Deno.env.get;
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
      Deno.env.get = originalEnvGet;
    },
  };
}

/** Parses the drill SSE protocol back into `{event, data}` pairs, same shape P2.3's client parser expects. */
async function collectSse(res: Response): Promise<Array<{ event: string; data: unknown }>> {
  const text = await res.text();
  const events: Array<{ event: string; data: unknown }> = [];
  for (const block of text.split('\n\n')) {
    if (block.trim() === '') continue;
    const lines = block.split('\n');
    const eventLine = lines.find((l) => l.startsWith('event: '));
    const dataLine = lines.find((l) => l.startsWith('data: '));
    if (!eventLine || !dataLine) continue;
    events.push({
      event: eventLine.slice('event: '.length).trim(),
      data: JSON.parse(dataLine.slice('data: '.length)),
    });
  }
  return events;
}

const sessionId = () => crypto.randomUUID();

// ---- target-word selection ---------------------------------------------

Deno.test('runDrill returns 400 and never calls Claude when there are no target words', async () => {
  const service = fakeService({});
  const fetchStub = stubFetch(() => {
    throw new Error('fetch must not be called when there are no target words');
  });
  try {
    const body: DrillBody = { sessionId: sessionId(), messages: [{ role: 'user', content: '' }] };
    const res = await runDrill(body, 'user-1', service);
    assertEquals(res.status, 400);
    assertEquals(await res.text(), 'no words to drill');
    assertEquals(fetchStub.calls.length, 0);
  } finally {
    fetchStub.restore();
  }
});

Deno.test('runDrill prefers due cards over recent reviews and embeds them in the request', async () => {
  const service = fakeService({
    due: [{ entry_id: 'keev' }],
    recent: [{ entry_id: 'chom' }], // must be ignored: due is non-empty
    entries: [
      { id: 'keev', hebrew: 'כאב', translations: { en: 'pain' } },
      { id: 'chom', hebrew: 'חום', translations: { en: 'fever' } },
    ],
  });
  const fetchStub = stubFetch(() => fakeUpstream([]));
  try {
    const body: DrillBody = { sessionId: sessionId(), messages: [{ role: 'user', content: '' }] };
    const res = await runDrill(body, 'user-1', service);
    await collectSse(res); // fully drain so the fake upstream reader always finishes cleanly

    assertEquals(fetchStub.calls.length, 1);
    const reqBody = fetchStub.calls[0].body!;
    assertEquals(reqBody.model, 'claude-haiku-4-5');
    assertEquals(reqBody.stream, true);
    assert(!('tool_choice' in reqBody), 'tool_choice must be absent before the 8th learner turn');

    const system = reqBody.system as Array<{ text: string; cache_control: unknown }>;
    assert(system[0].text.includes('כאב'), 'system prompt must include the due word');
    assert(!system[0].text.includes('חום'), 'system prompt must not include the ignored recent word');
    assertEquals(system[0].cache_control, { type: 'ephemeral' });

    const messages = reqBody.messages as Array<{ role: string; content: string }>;
    assertEquals(messages, [{ role: 'user', content: '(session start)' }]);
  } finally {
    fetchStub.restore();
  }
});

Deno.test('runDrill falls back to recent review_logs, dedupes entry ids, and caps target words at 15', async () => {
  // 30 rows cycling through 20 unique ids (w1..w20), each appearing at least once
  // in the first 20 rows -> after Set-dedup + slice(0, 15) we expect exactly w1..w15.
  const recent = Array.from({ length: 30 }, (_, i) => ({ entry_id: `w${(i % 20) + 1}` }));
  const entries: Entry[] = Array.from({ length: 20 }, (_, i) => ({
    id: `w${i + 1}`,
    hebrew: `h${i + 1}`,
    translations: { en: `e${i + 1}` },
  }));
  let capturedIds: string[] | undefined;
  const service = fakeService({ due: [], recent, entries, onDictionaryIds: (ids) => (capturedIds = ids) });
  const fetchStub = stubFetch(() => fakeUpstream([]));
  try {
    const body: DrillBody = { sessionId: sessionId(), messages: [{ role: 'user', content: '' }] };
    const res = await runDrill(body, 'user-1', service);
    await collectSse(res);

    assert(capturedIds, 'dictionary_entries.in() must have been called');
    assertEquals(capturedIds!.length, 15);
    assertEquals(capturedIds, Array.from({ length: 15 }, (_, i) => `w${i + 1}`));
  } finally {
    fetchStub.restore();
  }
});

// ---- prompt / request construction --------------------------------------

Deno.test('runDrill forces tool_choice to end_session once the learner has sent 8 messages', async () => {
  const service = fakeService({
    due: [{ entry_id: 'keev' }],
    entries: [{ id: 'keev', hebrew: 'כאב', translations: { en: 'pain' } }],
  });
  const fetchStub = stubFetch(() => fakeUpstream([]));
  try {
    const messages = Array.from({ length: 8 }, (_, i) => ({ role: 'user' as const, content: `turn ${i + 1}` }));
    const body: DrillBody = { sessionId: sessionId(), messages };
    const res = await runDrill(body, 'user-1', service);
    await collectSse(res);

    const reqBody = fetchStub.calls[0].body!;
    assertEquals(reqBody.tool_choice, { type: 'tool', name: 'end_session' });
  } finally {
    fetchStub.restore();
  }
});

Deno.test('runDrill omits tool_choice while the learner has sent fewer than 8 messages', async () => {
  const service = fakeService({
    due: [{ entry_id: 'keev' }],
    entries: [{ id: 'keev', hebrew: 'כאב', translations: { en: 'pain' } }],
  });
  const fetchStub = stubFetch(() => fakeUpstream([]));
  try {
    const messages = Array.from({ length: 3 }, (_, i) => ({ role: 'user' as const, content: `turn ${i + 1}` }));
    const body: DrillBody = { sessionId: sessionId(), messages };
    const res = await runDrill(body, 'user-1', service);
    await collectSse(res);

    const reqBody = fetchStub.calls[0].body!;
    assert(!('tool_choice' in reqBody));
  } finally {
    fetchStub.restore();
  }
});

// ---- SSE framing ---------------------------------------------------------

Deno.test('runDrill streams a delta event per text_delta chunk, ending with done', async () => {
  const service = fakeService({
    due: [{ entry_id: 'keev' }],
    entries: [{ id: 'keev', hebrew: 'כאב', translations: { en: 'pain' } }],
  });
  const chunks = [
    sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'שלום' } }),
    sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' מה שלומך?' } }),
  ];
  const fetchStub = stubFetch(() => fakeUpstream(chunks));
  try {
    const body: DrillBody = { sessionId: sessionId(), messages: [{ role: 'user', content: '' }] };
    const res = await runDrill(body, 'user-1', service);
    const events = await collectSse(res);

    assertEquals(events, [
      { event: 'delta', data: { text: 'שלום' } },
      { event: 'delta', data: { text: ' מה שלומך?' } },
      { event: 'done', data: {} },
    ]);
  } finally {
    fetchStub.restore();
  }
});

Deno.test('runDrill reassembles an SSE data line split across read chunks', async () => {
  const service = fakeService({
    due: [{ entry_id: 'keev' }],
    entries: [{ id: 'keev', hebrew: 'כאב', translations: { en: 'pain' } }],
  });
  const fullLine = sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'שלום עולם' } });
  const splitAt = Math.floor(fullLine.length / 2); // deliberately mid-line, not on a newline boundary
  const chunks = [fullLine.slice(0, splitAt), fullLine.slice(splitAt)];
  const fetchStub = stubFetch(() => fakeUpstream(chunks));
  try {
    const body: DrillBody = { sessionId: sessionId(), messages: [{ role: 'user', content: '' }] };
    const res = await runDrill(body, 'user-1', service);
    const events = await collectSse(res);

    assertEquals(events, [
      { event: 'delta', data: { text: 'שלום עולם' } },
      { event: 'done', data: {} },
    ]);
  } finally {
    fetchStub.restore();
  }
});

Deno.test('runDrill emits a single error event and closes the stream when a chunk fails to parse', async () => {
  // P2.3's DrillEvent type is `'delta' | 'feedback' | 'verdicts' | 'done' | 'error'` — 'error' is
  // part of the SSE contract even though the plan doc's happy-path diagram omits it.
  const service = fakeService({
    due: [{ entry_id: 'keev' }],
    entries: [{ id: 'keev', hebrew: 'כאב', translations: { en: 'pain' } }],
  });
  const chunks = ['data: {this is not valid json\n\n'];
  const fetchStub = stubFetch(() => fakeUpstream(chunks));
  try {
    const body: DrillBody = { sessionId: sessionId(), messages: [{ role: 'user', content: '' }] };
    const res = await runDrill(body, 'user-1', service);
    const events = await collectSse(res);

    // A parse failure throws inside the read loop, so `done` (which runs after the
    // loop completes normally) must never fire — only the caught `error` event.
    assertEquals(events.length, 1);
    assertEquals(events[0].event, 'error');
    const data = events[0].data as { message: string };
    assert(typeof data.message === 'string' && data.message.length > 0);
  } finally {
    fetchStub.restore();
  }
});

// ---- tool-result -> verdict/feedback mapping -----------------------------

Deno.test('runDrill maps a give_feedback tool_use block into a feedback event', async () => {
  const service = fakeService({
    due: [{ entry_id: 'keev' }],
    entries: [{ id: 'keev', hebrew: 'כאב', translations: { en: 'pain' } }],
  });
  const feedback = { right: 'nice use of חום', correction: '', tip: 'try כאב next' };
  const feedbackJson = JSON.stringify(feedback);
  const mid = Math.floor(feedbackJson.length / 2);
  const chunks = [
    sseLine({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'give_feedback', input: {} },
    }),
    sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: feedbackJson.slice(0, mid) } }),
    sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: feedbackJson.slice(mid) } }),
    sseLine({ type: 'content_block_stop', index: 0 }),
  ];
  const fetchStub = stubFetch(() => fakeUpstream(chunks));
  try {
    const body: DrillBody = { sessionId: sessionId(), messages: [{ role: 'user', content: 'יש לך חום?' }] };
    const res = await runDrill(body, 'user-1', service);
    const events = await collectSse(res);

    assertEquals(events, [
      { event: 'feedback', data: feedback },
      { event: 'done', data: {} },
    ]);
  } finally {
    fetchStub.restore();
  }
});

Deno.test('runDrill maps an end_session tool_use block into a verdicts event with the parsed array', async () => {
  const service = fakeService({
    due: [{ entry_id: 'keev' }],
    entries: [{ id: 'keev', hebrew: 'כאב', translations: { en: 'pain' } }],
  });
  const verdicts = [{ entryId: 'keev', verdict: 'used_correctly' }];
  const verdictsJson = JSON.stringify({ verdicts });
  const chunks = [
    sseLine({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'toolu_2', name: 'end_session', input: {} },
    }),
    sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: verdictsJson } }),
    sseLine({ type: 'content_block_stop', index: 0 }),
  ];
  const fetchStub = stubFetch(() => fakeUpstream(chunks));
  try {
    const body: DrillBody = { sessionId: sessionId(), messages: [{ role: 'user', content: 'להתראות' }] };
    const res = await runDrill(body, 'user-1', service);
    const events = await collectSse(res);

    assertEquals(events, [
      { event: 'verdicts', data: verdicts },
      { event: 'done', data: {} },
    ]);
  } finally {
    fetchStub.restore();
  }
});

// ---- upstream failure -----------------------------------------------------

Deno.test('runDrill returns 502 when the upstream Claude call is not ok', async () => {
  const service = fakeService({
    due: [{ entry_id: 'keev' }],
    entries: [{ id: 'keev', hebrew: 'כאב', translations: { en: 'pain' } }],
  });
  const fetchStub = stubFetch(() => fakeUpstream([], { ok: false, status: 500 }));
  try {
    const body: DrillBody = { sessionId: sessionId(), messages: [{ role: 'user', content: '' }] };
    const res = await runDrill(body, 'user-1', service);
    assertEquals(res.status, 502);
    assertEquals(await res.text(), 'coach unavailable');
  } finally {
    fetchStub.restore();
  }
});
