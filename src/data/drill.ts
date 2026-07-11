import { supabase } from '../lib/supabase';
import { submitReview } from './cards';

export type DrillMessage = { role: 'user' | 'assistant'; content: string };
export type DrillEvent = {
  type: 'delta' | 'feedback' | 'verdicts' | 'done' | 'error';
  payload: unknown;
};

export class DrillQuotaError extends Error {}

export function parseSseChunks(chunks: string[]): DrillEvent[] {
  const events: DrillEvent[] = [];
  let buffer = '';
  for (const chunk of chunks) {
    buffer += chunk;
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const eventLine = block.split('\n').find((l) => l.startsWith('event: '));
      const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
      if (!eventLine || !dataLine) continue;
      events.push({
        type: eventLine.slice(7).trim() as DrillEvent['type'],
        payload: JSON.parse(dataLine.slice(6)),
      });
    }
  }
  return events;
}

export async function* streamDrill(
  sessionId: string, messages: DrillMessage[],
): AsyncGenerator<DrillEvent> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('not signed in');
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drill`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, messages }),
    },
  );
  if (res.status === 429) throw new DrillQuotaError();
  if (!res.ok || !res.body) throw new Error(`drill failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const cut = pending.lastIndexOf('\n\n');
    if (cut === -1) continue;
    const complete = pending.slice(0, cut + 2);
    pending = pending.slice(cut + 2);
    for (const ev of parseSseChunks([complete])) yield ev;
  }
}

async function entriesReviewedToday(): Promise<Set<string>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data } = await supabase
    .from('review_logs')
    .select('entry_id')
    .eq('user_id', user.id)
    .eq('counts_for_scheduling', true)
    .gte('reviewed_at', startOfDay.toISOString());
  return new Set((data ?? []).map((r) => r.entry_id));
}

export async function applyDrillVerdicts(
  verdicts: Array<{ entryId: string; verdict: string; hebrew: string; en: string }>,
): Promise<void> {
  const reviewedToday = await entriesReviewedToday();
  for (const v of verdicts) {
    if (v.verdict === 'not_attempted') continue;
    await submitReview({
      entryId: v.entryId,
      form: 'drill',
      correct: v.verdict === 'used_correctly',
      latencyMs: 0,
      ...(reviewedToday.has(v.entryId) ? { countsForScheduling: false } : {}),
    });
  }
}
