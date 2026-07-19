import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { getProfile } from '../data/profile';

export function AdminRoute({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'no' | 'yes'>('checking');
  useEffect(() => { getProfile().then((p) => setState(p?.isAdmin ? 'yes' : 'no')); }, []);
  if (state === 'checking') return <p className="p-4">…</p>;
  if (state === 'no') return <Navigate to="/" replace />;
  return <>{children}</>;
}
