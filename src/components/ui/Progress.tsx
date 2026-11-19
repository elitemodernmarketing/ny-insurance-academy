import { cn } from './cn';

export function Progress({ value, max = 100, label, className, tone = 'primary', showValue = false }: { value: number; max?: number; label: string; className?: string; tone?: 'primary' | 'success' | 'warning' | 'danger' | 'accent'; showValue?: boolean }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cn('w-full', className)}>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn('h-full rounded-full transition-[width] duration-500',
            tone === 'primary' && 'bg-primary', tone === 'success' && 'bg-success', tone === 'warning' && 'bg-warning', tone === 'danger' && 'bg-danger', tone === 'accent' && 'bg-accent')}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showValue && <div className="mt-1 text-xs text-muted">{Math.round(pct)}%</div>}
    </div>
  );
}
