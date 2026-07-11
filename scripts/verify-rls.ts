import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env.content' });

const url = process.env.VITE_SUPABASE_URL!;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const EMAIL = 'rls-check@medlingo.test';
const PASS = 'rls-check-password-123';
let failures = 0;

function check(name: string, ok: boolean) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
}

async function main() {
  // seed: test user + one draft unit
  const { data: existing } = await admin.auth.admin.listUsers();
  let userId = existing.users.find((u) => u.email === EMAIL)?.id;
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL, password: PASS, email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
  }
  await admin.from('units').upsert({
    slug: 'rls-draft-unit', level: 1, display_order: 999, status: 'draft',
    title: { en: 'RLS draft' }, dialogue: [],
  });

  // anon (signed out) reads nothing
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: anonDict } = await anon.from('dictionary_entries').select('id').limit(1);
  check('signed-out client reads no dictionary rows', (anonDict ?? []).length === 0);

  // signed-in user
  const user = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await user.auth.signInWithPassword({ email: EMAIL, password: PASS });
  if (signInErr) throw signInErr;

  const { data: dictRows, error: dictErr } = await user.from('dictionary_entries').select('id').limit(1);
  check('signed-in user can read dictionary', dictErr === null);
  const sampleEntryId = dictRows?.[0]?.id as string | undefined;

  const { data: draftRows } = await user.from('units').select('slug').eq('slug', 'rls-draft-unit');
  check('signed-in non-admin cannot see draft units', (draftRows ?? []).length === 0);

  const { error: foreignLog } = await user.from('review_logs').insert({
    user_id: '00000000-0000-0000-0000-000000000000',
    entry_id: 'nonexistent', practice_form: 'cloze', rating: 'good',
  });
  check("cannot insert another user's review_logs", foreignLog !== null);

  // seed a fresh review_logs row (as admin, bypassing RLS) so the update-rejection
  // check below has a real before/after value to compare, not a possibly-empty set
  const { data: seededLog, error: seedErr } = await admin.from('review_logs').insert({
    user_id: userId!, entry_id: sampleEntryId!, practice_form: 'cloze', rating: 'good',
    counts_for_scheduling: false,
  }).select('id, rating').single();
  if (seedErr) throw seedErr;

  const { error: updErr } = await user.from('review_logs')
    .update({ rating: 'easy' }).eq('id', seededLog.id).select();
  const { data: afterLog } = await admin.from('review_logs')
    .select('rating').eq('id', seededLog.id).single();
  const updateHadNoEffect = afterLog?.rating === seededLog.rating;
  check('review_logs update is rejected/ineffective', updErr !== null || updateHadNoEffect);

  const { data: metricsRows, error: metricsErr } = await user
    .from('v_reviews_per_user_day').select('*');
  check(
    'metrics views not readable by clients',
    metricsErr !== null || (metricsRows ?? []).length === 0,
  );

  // cleanup
  await admin.from('units').delete().eq('slug', 'rls-draft-unit');
  await admin.from('review_logs').delete().eq('id', seededLog.id);
  console.log(failures === 0 ? '\nALL RLS CHECKS PASSED' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
