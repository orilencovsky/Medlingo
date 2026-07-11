import { Routes, Route } from 'react-router';
import { AuthPage } from './pages/AuthPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { HomePage } from './pages/HomePage';
import { UnitPage } from './pages/UnitPage';
import { ReviewPage } from './pages/ReviewPage';
import { DrillPage } from './pages/DrillPage';
import { ProtectedRoute } from './components/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
      <Route path="/unit/:slug" element={<ProtectedRoute><UnitPage /></ProtectedRoute>} />
      <Route path="/review" element={<ProtectedRoute><ReviewPage /></ProtectedRoute>} />
      <Route path="/drill" element={<ProtectedRoute><DrillPage /></ProtectedRoute>} />
    </Routes>
  );
}
