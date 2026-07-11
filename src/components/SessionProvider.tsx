import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getProfile } from '../data/profile';
import { applyLanguage } from '../lib/i18n';

const SessionContext = createContext<{ session: Session | null; loading: boolean }>({
  session: null,
  loading: true,
});

// Apply the signed-in user's saved UI language app-wide, so a returning
// non-English user who deep-links or refreshes onto any route (not just Home)
// sees their language and correct text direction immediately.
async function applySavedLanguage() {
  try {
    const profile = await getProfile();
    if (profile?.uiLanguage) await applyLanguage(profile.uiLanguage);
  } catch {
    // best-effort; falls back to the default language
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session) applySavedLanguage();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) applySavedLanguage();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={{ session, loading }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
