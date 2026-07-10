import type { ReactNode } from 'react';

export function He({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="rtl" lang="he" className={className}>
      {children}
    </bdi>
  );
}
