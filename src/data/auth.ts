import { supabase } from '../lib/supabase';

// auth.getSession() resolves from the locally persisted session (refreshing
// only when the token expired), unlike auth.getUser() which round-trips to
// the auth server on every call. The id is only used to shape queries and
// rows client-side — RLS re-validates the JWT server-side on every request,
// so nothing security-relevant trusts this value.
export async function currentUserIdOrNull(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

export async function currentUserId(): Promise<string> {
  const id = await currentUserIdOrNull();
  if (!id) throw new Error('not signed in');
  return id;
}
