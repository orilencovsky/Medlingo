import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useSession } from './SessionProvider';
import { getProfile } from '../data/profile';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const { t } = useTranslation();
  const [profileState, setProfileState] = useState<'checking' | 'missing' | 'ok'>('checking');

  useEffect(() => {
    if (!session) return;
    getProfile().then((p) => setProfileState(p ? 'ok' : 'missing'));
  }, [session]);

  if (loading) return <p className="p-4">{t('common.loading')}</p>;
  if (!session) return <Navigate to="/auth" replace />;
  if (profileState === 'checking') return <p className="p-4">{t('common.loading')}</p>;
  if (profileState === 'missing') return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}
