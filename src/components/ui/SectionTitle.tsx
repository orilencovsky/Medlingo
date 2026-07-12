import type { ReactNode } from 'react';

interface SectionTitleProps {
  children: ReactNode;
  action?: ReactNode;
}

export function SectionTitle({ children, action }: SectionTitleProps) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-extrabold text-ink">{children}</h2>
      {action}
    </div>
  );
}
