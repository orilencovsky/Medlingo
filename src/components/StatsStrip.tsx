import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

interface StatsStripProps {
  streak: number;
  dueCount: number;
  mastered: number;
  learned: number;
}

function Tile({ value, label, highlight = false }: { value: number; label: string; highlight?: boolean }) {
  return (
    <>
      <span className={`text-xl font-bold ${highlight ? 'text-blue-700' : ''}`}>{value}</span>
      <span className="text-xs text-gray-600">{label}</span>
    </>
  );
}

export function StatsStrip({ streak, dueCount, mastered, learned }: StatsStripProps) {
  const { t } = useTranslation();
  const tile = 'flex flex-col items-center rounded border p-2';
  return (
    <div data-testid="stats-strip" className="grid grid-cols-4 gap-2">
      <div className={tile}>
        <Tile value={streak} label={t('home.stats.streak')} />
      </div>
      {dueCount > 0 ? (
        <Link data-testid="stat-due" to="/review" className={`${tile} border-blue-700`}>
          <Tile value={dueCount} label={t('home.stats.dueToday')} highlight />
        </Link>
      ) : (
        <div data-testid="stat-due" className={tile}>
          <Tile value={dueCount} label={t('home.stats.dueToday')} />
        </div>
      )}
      <div className={tile}>
        <Tile value={mastered} label={t('home.stats.mastered')} />
      </div>
      <div className={tile}>
        <Tile value={learned} label={t('home.stats.learned')} />
      </div>
    </div>
  );
}
