import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';

type ProfileRow = {
  user_id: string; display_name: string; ui_language: string; is_admin: boolean;
  streak_current: number; streak_longest: number; last_active_date: string | null;
};

function mapProfileRow(r: ProfileRow): Profile {
  return {
    userId: r.user_id, displayName: r.display_name, uiLanguage: r.ui_language,
    isAdmin: r.is_admin, streakCurrent: r.streak_current,
    streakLongest: r.streak_longest, lastActiveDate: r.last_active_date,
  };
}

export async function getProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data ? mapProfileRow(data as ProfileRow) : null;
}

export async function completeOnboarding(displayName: string): Promise<Profile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');
  const { data, error } = await supabase
    .from('profiles')
    .insert({ user_id: user.id, display_name: displayName })
    .select()
    .single();
  if (error) throw error;
  return mapProfileRow(data as ProfileRow);
}
