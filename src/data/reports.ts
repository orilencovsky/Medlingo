import { supabase } from '../lib/supabase';

export async function reportWordProblem(entryId: string, message: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');
  const { error } = await supabase
    .from('word_reports')
    .insert({ user_id: user.id, entry_id: entryId, message });
  if (error) throw error;
}
