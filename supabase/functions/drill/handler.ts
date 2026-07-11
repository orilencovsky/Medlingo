import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSessionStart, validateBody, type DrillBody } from './lib.ts';
import { corsHeaders } from './cors.ts';

const MAX_SESSIONS_PER_DAY = 3;

/**
 * Post-auth logic: enforce the daily session quota, then dispatch to
 * `runDrill`. Split out of `handler` so it can be exercised directly with an
 * injected fake service (same pattern claude.test.ts uses for `runDrill`)
 * without needing a real Supabase/network round trip.
 */
export async function handleDrillRequest(
  body: DrillBody,
  user: { id: string },
  service: SupabaseClient,
): Promise<Response> {
  if (isSessionStart(body.messages)) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: usage } = await service.from('drill_usage')
      .select('sessions_started').eq('user_id', user.id).eq('usage_date', today).maybeSingle();
    const started = usage?.sessions_started ?? 0;
    if (started >= MAX_SESSIONS_PER_DAY) {
      return new Response('quota exhausted', { status: 429, headers: corsHeaders });
    }
    await service.from('drill_usage').upsert(
      { user_id: user.id, usage_date: today, sessions_started: started + 1 },
      { onConflict: 'user_id,usage_date' },
    );
  }

  try {
    const { runDrill } = await import('./claude.ts');
    return await runDrill(body, user.id, service);
  } catch (e) {
    // A real DB/upstream error (e.g. loadTargetWords' Supabase queries
    // failing) must surface as a 5xx, not silently look like the 400 "no
    // words to drill" dead end. Log server-side for observability.
    console.error('drill: handleDrillRequest failed', e);
    return new Response('coach unavailable', { status: 500, headers: corsHeaders });
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  let user;
  try {
    ({ data: { user } } = await userClient.auth.getUser());
  } catch {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }
  if (!user) return new Response('unauthorized', { status: 401, headers: corsHeaders });

  const parsed = validateBody(await req.json().catch(() => null));
  if (!parsed.ok) return new Response(parsed.reason, { status: 400, headers: corsHeaders });

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  return handleDrillRequest(parsed.body, user, service);
}
