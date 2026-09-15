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
    // Supabase re-checks the session every time the browser tab regains
    // visibility and re-emits SIGNED_IN with the *same* (unrefreshed) token
    // when nothing actually changed. Without this guard that redundant event
    // re-triggered a profile fetch + full i18next language reload (which
    // re-renders every translated component and flips the document `dir`)
    // on every tab switch, which is what made the app feel stuck.
    let lastToken: string | null = null;
    supabase.auth.getSession().then(({ data }) => {
      lastToken = data.session?.access_token ?? null;
      setSession(data.session);
      setLoading(false);
      if (data.session) applySavedLanguage();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.access_token === lastToken) return;
      lastToken = s?.access_token ?? null;
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
