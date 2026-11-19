import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string): string {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors select-none',
    'disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
    size === 'sm' && 'h-8 px-3 text-sm',
    size === 'md' && 'h-10 px-4 text-sm',
    size === 'lg' && 'h-12 px-6 text-base',
    size === 'icon' && 'h-9 w-9',
    variant === 'primary' && 'bg-primary text-primary-fg hover:opacity-90',
    variant === 'secondary' && 'bg-surface-2 text-fg hover:bg-border/60',
    variant === 'outline' && 'border border-border bg-surface text-fg hover:bg-surface-2',
    variant === 'ghost' && 'text-fg hover:bg-surface-2',
    variant === 'danger' && 'bg-danger text-bg hover:opacity-90',
    variant === 'success' && 'bg-success text-bg hover:opacity-90',
    extra,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: ButtonVariant; size?: ButtonSize }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant, size, className, type = 'button', ...rest }, ref) {
  return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...rest} />;
});

export function ButtonLink({ variant, size, className, ...rest }: LinkProps & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}
