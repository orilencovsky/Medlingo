import { Routes, Route } from 'react-router';
import { AuthPage } from './pages/AuthPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { HomePage } from './pages/HomePage';
import { UnitPage } from './pages/UnitPage';
import { ReviewPage } from './pages/ReviewPage';
import { DrillPage } from './pages/DrillPage';
import { DictionaryPage } from './pages/DictionaryPage';
import { TopicPage } from './pages/TopicPage';
import { AnatomyView } from './pages/AnatomyView';
import { AdminDictionaryPage } from './pages/AdminDictionaryPage';
import { AdminAnatomyPage } from './pages/AdminAnatomyPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { AppShell } from './components/AppShell';

export default function App() {
  return (
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
        <Route path="/anatomy" element={<AnatomyView />} />
        <Route path="/admin/dictionary" element={<AdminRoute><AdminDictionaryPage /></AdminRoute>} />
        <Route path="/admin/anatomy" element={<AdminRoute><AdminAnatomyPage /></AdminRoute>} />
      </Route>
    </Routes>
  );
}
