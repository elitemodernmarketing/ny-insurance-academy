import * as T from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { cn } from './cn';

export const Tabs = T.Root;
export function TabsList({ className, ...p }: ComponentProps<typeof T.List>) {
  return <T.List className={cn('inline-flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1', className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: ComponentProps<typeof T.Trigger>) {
  return <T.Trigger className={cn('rounded-md px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-fg data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-sm', className)} {...p} />;
}
export function TabsContent({ className, ...p }: ComponentProps<typeof T.Content>) {
  return <T.Content className={cn('mt-4 focus-visible:outline-none', className)} {...p} />;
}
