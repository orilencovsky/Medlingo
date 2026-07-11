import { useTranslation } from 'react-i18next';
import { Flame, Clock, Award, BookOpen } from 'lucide-react';
import { StatTile } from './ui/StatTile';

interface StatsStripProps {
  streak: number;
  dueCount: number;
  mastered: number;
  learned: number;
}

export function StatsStrip({ streak, dueCount, mastered, learned }: StatsStripProps) {
  const { t } = useTranslation();
  return (
    <div data-testid="stats-strip" className="grid grid-cols-4 gap-2">
      <StatTile icon={<Flame className="size-4" />} value={streak} label={t('home.stats.streak')} />
      <StatTile
        icon={<Clock className="size-4" />}
        value={dueCount}
        label={t('home.stats.dueToday')}
        emphasis={dueCount > 0}
        to={dueCount > 0 ? '/review' : undefined}
        data-testid="stat-due"
      />
      <StatTile icon={<Award className="size-4" />} value={mastered} label={t('home.stats.mastered')} />
      <StatTile icon={<BookOpen className="size-4" />} value={learned} label={t('home.stats.learned')} />
    </div>
  );
}
