import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from 'react';
import { cn } from './cn';
import { AlertTriangle, Info, Lightbulb, Scale, Inbox } from 'lucide-react';

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface p-8 text-center">
      <div className="mb-3 text-muted">{icon ?? <Inbox className="h-8 w-8" aria-hidden />}</div>
      <h2 className="text-base font-semibold">{title}</h2>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[0.75em] text-muted">{children}</kbd>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'success' | 'warning' | 'danger' | 'primary' }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={cn('mt-1 text-2xl font-bold tabular-nums', tone === 'success' && 'text-success', tone === 'warning' && 'text-warning', tone === 'danger' && 'text-danger', tone === 'primary' && 'text-primary')}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Select({ className, label, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <select className={cn('h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg', className)} {...rest}>{children}</select>
    </label>
  );
}

export function TextField({ label, hint, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <input className={cn('h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg placeholder:text-muted', className)} {...rest} />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const CALLOUT = {
  'exam-trap': { icon: AlertTriangle, label: 'Exam trap', cls: 'border-warning/40 bg-warning/5' },
  'ny-rule': { icon: Scale, label: 'New York rule', cls: 'border-primary/40 bg-primary/5' },
  'memory-tip': { icon: Lightbulb, label: 'Memory tip', cls: 'border-accent/40 bg-accent/5' },
  note: { icon: Info, label: 'Note', cls: 'border-border bg-surface-2' },
} as const;
export function Callout({ kind, children, footer }: { kind: keyof typeof CALLOUT; children: ReactNode; footer?: ReactNode }) {
  const c = CALLOUT[kind];
  const Icon = c.icon;
  return (
    <div className={cn('my-3 rounded-lg border-l-4 p-3 text-sm', c.cls)} role="note">
      <div className="mb-1 flex items-center gap-1.5 font-semibold"><Icon className="h-4 w-4" aria-hidden />{c.label}</div>
      <div>{children}</div>
      {footer && <div className="mt-1 text-xs text-muted">{footer}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 p-6 text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
      <span>{label}…</span>
    </div>
  );
}
