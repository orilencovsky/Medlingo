import { Routes, Route } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AuthPage } from './pages/AuthPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ProtectedRoute } from './components/ProtectedRoute';

function HomePlaceholder() {
  const { t } = useTranslation();
  return <h1 className="p-4 text-2xl font-semibold">{t('app.title')}</h1>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/" element={<ProtectedRoute><HomePlaceholder /></ProtectedRoute>} />
    </Routes>
  );
}
