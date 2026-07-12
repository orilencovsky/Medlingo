import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { completeOnboarding } from '../data/profile';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

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
    <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <Card className="w-full max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-white">
              {t('app.title').charAt(0)}
            </div>
            <h1 className="text-lg font-extrabold text-ink">{t('onboarding.title')}</h1>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-ink">{t('onboarding.nameLabel')}</span>
            <input
              data-testid="onboarding-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-border p-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <p className="text-sm text-ink-subtle">{t('onboarding.consent')}</p>
          <Button data-testid="onboarding-submit" type="submit" className="w-full">
            {t('onboarding.start')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
