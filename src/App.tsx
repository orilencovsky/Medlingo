import { Routes, Route } from 'react-router';

function Landing() {
  return <h1 className="p-4 text-2xl font-semibold">MedLingo</h1>;
}

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}
