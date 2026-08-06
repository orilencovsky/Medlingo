import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { AppShell } from './components/AppShell';

// Each page loads as its own chunk so the initial download carries only the
// shell + the page being visited. React Router wraps navigations in a
// transition, so the fallback only shows on the very first load.
const AuthPage = lazy(() => import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage').then((m) => ({ default: m.OnboardingPage })));
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const UnitPage = lazy(() => import('./pages/UnitPage').then((m) => ({ default: m.UnitPage })));
const ReviewPage = lazy(() => import('./pages/ReviewPage').then((m) => ({ default: m.ReviewPage })));
const DrillPage = lazy(() => import('./pages/DrillPage').then((m) => ({ default: m.DrillPage })));
const DictionaryPage = lazy(() => import('./pages/DictionaryPage').then((m) => ({ default: m.DictionaryPage })));
const TopicPage = lazy(() => import('./pages/TopicPage').then((m) => ({ default: m.TopicPage })));
const AnatomyPage = lazy(() => import('./pages/AnatomyPage').then((m) => ({ default: m.AnatomyPage })));
const AdminDictionaryPage = lazy(() => import('./pages/AdminDictionaryPage').then((m) => ({ default: m.AdminDictionaryPage })));
const AdminAnatomyPage = lazy(() => import('./pages/AdminAnatomyPage').then((m) => ({ default: m.AdminAnatomyPage })));

function PageLoading() {
  const { t } = useTranslation();
  return <p className="p-4">{t('common.loading')}</p>;
}

export default function App() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          <Route path="/" element={<HomePage />} />
          <Route path="/unit/:slug" element={<UnitPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/drill" element={<DrillPage />} />
          <Route path="/dictionary" element={<DictionaryPage />} />
          <Route path="/dictionary/:topic" element={<TopicPage />} />
          <Route path="/anatomy" element={<AnatomyPage />} />
          <Route path="/admin/dictionary" element={<AdminRoute><AdminDictionaryPage /></AdminRoute>} />
          <Route path="/admin/anatomy" element={<AdminRoute><AdminAnatomyPage /></AdminRoute>} />
        </Route>
      </Routes>
    </Suspense>
  );
}
