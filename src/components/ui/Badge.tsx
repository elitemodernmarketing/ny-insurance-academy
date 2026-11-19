import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
export function Badge({ tone = 'neutral', className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        tone === 'neutral' && 'bg-surface-2 text-muted ring-border',
        tone === 'primary' && 'bg-primary/10 text-primary ring-primary/30',
        tone === 'success' && 'bg-success/10 text-success ring-success/30',
        tone === 'warning' && 'bg-warning/10 text-warning ring-warning/30',
        tone === 'danger' && 'bg-danger/10 text-danger ring-danger/30',
        tone === 'info' && 'bg-info/10 text-info ring-info/30',
        tone === 'accent' && 'bg-accent/10 text-accent ring-accent/30',
        className,
      )}
      {...rest}
    />
  );
}
