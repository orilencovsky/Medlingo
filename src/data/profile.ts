import { supabase } from '../lib/supabase';
import { currentUserIdOrNull } from './auth';
import type { Profile } from '../lib/types';

type ProfileRow = {
  user_id: string; display_name: string; ui_language: string; is_admin: boolean;
  can_approve: boolean;
  streak_current: number; streak_longest: number; last_active_date: string | null;
};

function mapProfileRow(r: ProfileRow): Profile {
  return {
    userId: r.user_id, displayName: r.display_name, uiLanguage: r.ui_language,
    isAdmin: r.is_admin, canApprove: r.can_approve, streakCurrent: r.streak_current,
    streakLongest: r.streak_longest, lastActiveDate: r.last_active_date,
  };
}

// The profile is read by SessionProvider, ProtectedRoute, AppShell and the
// landing page during a single app boot. Caching the in-flight promise per
// user collapses those into one query. Writes below invalidate; a missing
// row (mid-onboarding) or a failure is never cached.
let cache: { userId: string; promise: Promise<Profile | null> } | null = null;

export function invalidateProfileCache(): void {
  cache = null;
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ? mapProfileRow(data as ProfileRow) : null;
}

export async function getProfile(): Promise<Profile | null> {
  const userId = await currentUserIdOrNull();
  if (!userId) {
    cache = null;
    return null;
  }
  if (cache?.userId !== userId) {
    const promise = fetchProfile(userId);
    cache = { userId, promise };
    promise.then(
      (profile) => { if (profile === null && cache?.promise === promise) cache = null; },
      () => { if (cache?.promise === promise) cache = null; },
    );
  }
  return cache.promise;
}

export async function setUiLanguage(lang: string): Promise<void> {
  const userId = await currentUserIdOrNull();
  if (!userId) return;
  const { error } = await supabase
    .from('profiles')
    .update({ ui_language: lang })
    .eq('user_id', userId);
  if (error) throw error;
  invalidateProfileCache();
}

export async function completeOnboarding(displayName: string): Promise<Profile> {
  const userId = await currentUserIdOrNull();
  if (!userId) throw new Error('not signed in');
  const { data, error } = await supabase
    .from('profiles')
    .insert({ user_id: userId, display_name: displayName })
    .select()
    .single();
  if (error) throw error;
  const profile = mapProfileRow(data as ProfileRow);
  // Prime the cache so the guard's profile check right after onboarding
  // resolves without waiting on (or racing) a fresh read.
  cache = { userId: profile.userId, promise: Promise.resolve(profile) };
  return profile;
}

export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function computeStreak(
  prev: { current: number; longest: number; lastActiveDate: string | null },
  todayLocal: string,
): { current: number; longest: number; lastActiveDate: string } {
  if (prev.lastActiveDate === todayLocal) {
    return { current: prev.current, longest: prev.longest, lastActiveDate: todayLocal };
  }
  const yesterday = localDateString(new Date(new Date(`${todayLocal}T12:00:00`).getTime() - 86_400_000));
  const current = prev.lastActiveDate === yesterday ? prev.current + 1 : 1;
  return { current, longest: Math.max(prev.longest, current), lastActiveDate: todayLocal };
}

export async function touchStreak(): Promise<void> {
  const profile = await getProfile();
  if (!profile) return;
  const next = computeStreak(
    { current: profile.streakCurrent, longest: profile.streakLongest, lastActiveDate: profile.lastActiveDate },
    localDateString(),
  );
  const { error } = await supabase
    .from('profiles')
    .update({
      streak_current: next.current,
      streak_longest: next.longest,
      last_active_date: next.lastActiveDate,
    })
    .eq('user_id', profile.userId);
  if (error) throw error;
  invalidateProfileCache();
}
