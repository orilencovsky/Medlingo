import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export function AuthPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setStatus(error ? 'error' : 'sent');
  }

  async function googleSignIn() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setStatus('error');
  }

  async function devSignIn() {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) setStatus('error');
  }

  if (status === 'sent') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
        <Card className="w-full max-w-sm text-center">
          <p className="text-ink">{t('auth.checkEmail')}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <Card className="w-full max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-white">
              {t('app.title').charAt(0)}
            </div>
            <h1 className="text-lg font-extrabold text-ink">{t('auth.title')}</h1>
          </div>
          <Button
            data-testid="auth-google"
            type="button"
            variant="secondary"
            onClick={googleSignIn}
            className="w-full"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            {t('auth.google')}
          </Button>
          <div className="flex items-center gap-3 text-sm text-ink-subtle">
            <span className="h-px flex-1 bg-border" />
            {t('auth.or')}
            <span className="h-px flex-1 bg-border" />
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-ink">{t('auth.emailLabel')}</span>
            <input
              data-testid="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-border p-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <Button data-testid="auth-submit" type="submit" className="w-full">
            {t('auth.sendLink')}
          </Button>
          {status === 'error' && <p role="alert" className="text-red-700">{t('auth.error')}</p>}
          {import.meta.env.DEV && (
            <Button
              data-testid="auth-dev-bypass"
              type="button"
              variant="ghost"
              onClick={devSignIn}
              className="w-full border border-dashed border-border text-sm text-ink-subtle"
            >
              Continue without sign-in (dev only)
            </Button>
          )}
        </form>
      </Card>
    </div>
  );
}
