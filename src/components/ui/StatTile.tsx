import type { ReactNode } from 'react';
import { Link } from 'react-router';

interface StatTileProps {
  icon: ReactNode;
  value: number | string;
  label: string;
  emphasis?: boolean;
  to?: string;
  'data-testid'?: string;
}

const BASE_CLASSES = 'flex flex-col items-center gap-1 rounded-md border border-border bg-surface p-3 text-center';

export function StatTile({ icon, value, label, emphasis = false, to, ...rest }: StatTileProps) {
  const classes = `${BASE_CLASSES} ${emphasis ? 'border-primary' : ''}`.trim();
  const content = (
    <>
      <span className={emphasis ? 'text-primary' : 'text-ink-subtle'}>{icon}</span>
      <span className={`text-lg font-bold ${emphasis ? 'text-primary' : 'text-ink'}`}>{value}</span>
      <span className="text-xs text-ink-subtle">{label}</span>
    </>
  );
  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <div className={classes} {...rest}>
      {content}
    </div>
  );
}
