import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  muted?: boolean;
  children: ReactNode;
}

export function Card({ interactive = false, muted = false, className, children, ...rest }: CardProps) {
  const classes = [
    'rounded-lg border border-border bg-surface p-4 shadow-card',
    interactive ? 'transition-shadow hover:shadow-raised' : '',
    muted ? 'opacity-70' : '',
    className ?? '',
  ].filter(Boolean).join(' ');
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
