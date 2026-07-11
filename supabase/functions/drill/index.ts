import { createClient } from '@supabase/supabase-js';
import { validateBody, isSessionStart } from './lib.ts';

const MAX_SESSIONS_PER_DAY = 3;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response('unauthorized', { status: 401 });

  const parsed = validateBody(await req.json().catch(() => null));
  if (!parsed.ok) return new Response(parsed.reason, { status: 400 });

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  if (isSessionStart(parsed.body.messages)) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: usage } = await service.from('drill_usage')
      .select('sessions_started').eq('user_id', user.id).eq('usage_date', today).maybeSingle();
    const started = usage?.sessions_started ?? 0;
    if (started >= MAX_SESSIONS_PER_DAY) return new Response('quota exhausted', { status: 429 });
    await service.from('drill_usage').upsert(
      { user_id: user.id, usage_date: today, sessions_started: started + 1 },
      { onConflict: 'user_id,usage_date' },
    );
  }

  const { runDrill } = await import('./claude.ts');
  return runDrill(parsed.body, user.id, service);
});
