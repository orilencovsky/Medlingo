import type { SupabaseClient } from '@supabase/supabase-js';
import type { DrillBody } from './lib.ts';
import { buildSystemPrompt, TOOLS, type TargetWord } from './prompt.ts';
import { countLearnerTurns } from './lib.ts';
import { corsHeaders } from './cors.ts';

const MODEL = 'claude-haiku-4-5';

async function loadTargetWords(service: SupabaseClient, userId: string): Promise<TargetWord[]> {
  const now = new Date().toISOString();
  const { data: due, error: dueError } = await service.from('user_card_state')
    .select('entry_id').eq('user_id', userId).lte('due', now).limit(15);
  if (dueError) throw dueError;
  let ids = (due ?? []).map((r) => r.entry_id);
  if (ids.length === 0) {
    const { data: recent, error: recentError } = await service.from('review_logs')
      .select('entry_id').eq('user_id', userId)
      .order('reviewed_at', { ascending: false }).limit(50);
    if (recentError) throw recentError;
    ids = [...new Set((recent ?? []).map((r) => r.entry_id))].slice(0, 15);
  }
  if (ids.length === 0) return [];
  const { data: entries, error: entriesError } = await service.from('dictionary_entries')
    .select('id, hebrew, translations').in('id', ids);
  if (entriesError) throw entriesError;
  return (entries ?? []).map((e) => ({
    id: e.id, hebrew: e.hebrew, en: (e.translations as { en: string }).en,
  }));
}

function sse(controller: ReadableStreamDefaultController, event: string, data: unknown) {
  controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

export async function runDrill(
  body: DrillBody, userId: string, service: SupabaseClient,
): Promise<Response> {
  const words = await loadTargetWords(service, userId);
  if (words.length === 0) return new Response('no words to drill', { status: 400, headers: corsHeaders });

  const forceEnd = countLearnerTurns(body.messages) >= 8;
  const claudeReq = {
    model: MODEL,
    max_tokens: 1024,
    stream: true,
    system: [{
      type: 'text',
      text: buildSystemPrompt(words),
      cache_control: { type: 'ephemeral' },
    }],
    tools: TOOLS,
    ...(forceEnd ? { tool_choice: { type: 'tool', name: 'end_session' } } : {}),
    messages: body.messages.map((m) => ({
      role: m.role,
      content: m.content === '' ? '(session start)' : m.content,
    })),
  };

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(claudeReq),
  });
  if (!upstream.ok || !upstream.body) {
    return new Response('coach unavailable', { status: 502, headers: corsHeaders });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let toolName = '';
      let toolJson = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = JSON.parse(line.slice(6));
            if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta') {
              sse(controller, 'delta', { text: payload.delta.text });
            } else if (payload.type === 'content_block_start' && payload.content_block?.type === 'tool_use') {
              toolName = payload.content_block.name;
              toolJson = '';
            } else if (payload.type === 'content_block_delta' && payload.delta?.type === 'input_json_delta') {
              toolJson += payload.delta.partial_json;
            } else if (payload.type === 'content_block_stop' && toolName) {
              const input = JSON.parse(toolJson || '{}');
              if (toolName === 'give_feedback') sse(controller, 'feedback', input);
              if (toolName === 'end_session') sse(controller, 'verdicts', input.verdicts ?? []);
              toolName = '';
            }
          }
        }
        sse(controller, 'done', {});
      } catch (e) {
        sse(controller, 'error', { message: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...corsHeaders,
    },
  });
}
