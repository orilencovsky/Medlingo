import { Routes, Route } from 'react-router';
import { useTranslation } from 'react-i18next';

function Landing() {
  const { t } = useTranslation();
  return <h1 className="p-4 text-2xl font-semibold">{t('app.title')}</h1>;
}

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}
