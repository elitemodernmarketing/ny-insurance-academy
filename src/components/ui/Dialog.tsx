import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export function Dialog({ open, onOpenChange, title, description, children, footer, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/50 animate-fade-in" />
        <D.Content className={cn('fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-xl animate-fade-in', wide ? 'max-w-3xl' : 'max-w-lg')}>
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <D.Title className="text-lg font-semibold">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">Dialog</D.Description>}
            </div>
            <D.Close className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close dialog"><X className="h-5 w-5" /></D.Close>
          </div>
          {children}
          {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
