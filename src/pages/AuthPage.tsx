import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

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

  if (status === 'sent') return <p className="p-6 text-center">{t('auth.checkEmail')}</p>;

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{t('auth.title')}</h1>
      <label className="flex flex-col gap-1">
        <span>{t('auth.emailLabel')}</span>
        <input
          data-testid="auth-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border p-2"
        />
      </label>
      <button data-testid="auth-submit" type="submit" className="rounded bg-blue-700 p-2 text-white">
        {t('auth.sendLink')}
      </button>
      {status === 'error' && <p role="alert" className="text-red-700">{t('auth.error')}</p>}
    </form>
  );
}
