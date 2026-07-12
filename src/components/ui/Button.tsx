import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-strong',
  secondary: 'border border-primary text-primary bg-surface hover:bg-primary-tint',
  ghost: 'text-primary hover:bg-primary-tint',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'px-4 py-2 text-sm',
  sm: 'px-3 py-1.5 text-xs',
};

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none';

function buttonClassName(variant: ButtonVariant, size: ButtonSize, className?: string): string {
  return `${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className ?? ''}`.trim();
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', icon, className, type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClassName(variant, size, className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

interface LinkButtonProps {
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
  'data-testid'?: string;
}

export function LinkButton({ to, variant = 'primary', size = 'md', icon, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link to={to} className={buttonClassName(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
