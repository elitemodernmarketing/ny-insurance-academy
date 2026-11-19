import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-surface shadow-sm', className)} {...rest} />;
}
export function CardHeader({ title, description, action, className, as: H = 'h2' }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string; as?: 'h2' | 'h3' }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 p-4 pb-2 sm:p-5 sm:pb-2', className)}>
      <div className="min-w-0">
        <H className="text-base font-semibold leading-tight">{title}</H>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 pt-2 sm:p-5 sm:pt-2', className)} {...rest} />;
}
