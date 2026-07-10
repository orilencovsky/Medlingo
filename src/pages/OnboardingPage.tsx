import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { completeOnboarding } from '../data/profile';

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    await completeOnboarding(name.trim());
    navigate('/', { replace: true });
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{t('onboarding.title')}</h1>
      <label className="flex flex-col gap-1">
        <span>{t('onboarding.nameLabel')}</span>
        <input
          data-testid="onboarding-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border p-2"
        />
      </label>
      <p className="text-sm text-gray-600">{t('onboarding.consent')}</p>
      <button data-testid="onboarding-submit" type="submit" className="rounded bg-blue-700 p-2 text-white">
        {t('onboarding.start')}
      </button>
    </form>
  );
}
