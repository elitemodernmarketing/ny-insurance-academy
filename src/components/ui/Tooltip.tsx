import * as T from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

export const TooltipProvider = T.Provider;
export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-50 max-w-xs rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg shadow-lg animate-fade-in">
          {content}
          <T.Arrow className="fill-[rgb(var(--border))]" />
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
