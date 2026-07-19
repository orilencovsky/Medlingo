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

  // deprecated rows are hidden from non-admin learners
  await admin.from('dictionary_entries')
    .update({ is_deprecated: true }).eq('id', sampleEntryId!);
  const { data: depRows } = await user.from('dictionary_entries')
    .select('id').eq('id', sampleEntryId!);
  check('non-admin cannot read deprecated entries', (depRows ?? []).length === 0);
  await admin.from('dictionary_entries')
    .update({ is_deprecated: false }).eq('id', sampleEntryId!);

  // non-admin cannot insert an entry_edit
  const { error: editErr } = await user.from('entry_edits').insert({
    entry_id: sampleEntryId!, change_type: 'update', payload: {}, editor_id: userId!,
  });
  check('non-admin cannot stage an entry_edit', editErr !== null);

  // non-approver cannot run apply_entry_edit
  const { error: rpcErr } = await user.rpc('apply_entry_edit', {
    edit_id: '00000000-0000-0000-0000-000000000000', decision: 'approved',
  });
  check('non-approver cannot call apply_entry_edit', rpcErr !== null);

  // a reviewer (or any non-approver) cannot bypass moderation with a direct content update.
  // NOTE: this asserts the guard_entry_content trigger fires. `user` here is a plain
  // learner; to exercise the reviewer path, temporarily set is_admin=true on this test
  // user (admin client) so the update reaches the trigger rather than RLS.
  await admin.from('profiles').update({ is_admin: true }).eq('user_id', userId!);
  const { error: contentErr } = await user.from('dictionary_entries')
    .update({ hebrew: 'TAMPERED' }).eq('id', sampleEntryId!);
  const { data: afterEntry } = await admin.from('dictionary_entries')
    .select('hebrew').eq('id', sampleEntryId!).single();
  check('reviewer cannot directly edit content columns',
    contentErr !== null || afterEntry?.hebrew !== 'TAMPERED');
  await admin.from('profiles').update({ is_admin: false }).eq('user_id', userId!);

  // profile insert cannot self-grant can_approve (0010 fix: own_profile_insert now
  // requires can_approve = false). own_profile_insert also requires user_id =
  // auth.uid(), so a second throwaway user can't be used to isolate this — a forged
  // insert for a fresh uuid would just fail on the user_id clause instead. Reuse
  // this test user: delete its profile row (admin, bypasses RLS) so `user` can
  // attempt a fresh insert, try the forged insert, then restore a clean row. Placed
  // immediately before cleanup so the restored profile's state doesn't need to
  // satisfy any check that runs later.
  await admin.from('profiles').delete().eq('user_id', userId!);
  const { error: forgeErr } = await user.from('profiles')
    .insert({ user_id: userId!, display_name: 'RLS Forge', can_approve: true });
  check('cannot self-grant can_approve at profile insert', forgeErr !== null);
  const { error: restoreErr } = await user.from('profiles')
    .insert({ user_id: userId!, display_name: 'RLS Check' });
  check('profile insert without can_approve succeeds', restoreErr === null);

  // cleanup
  await admin.from('units').delete().eq('slug', 'rls-draft-unit');
  await admin.from('review_logs').delete().eq('id', seededLog.id);
  console.log(failures === 0 ? '\nALL RLS CHECKS PASSED' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
