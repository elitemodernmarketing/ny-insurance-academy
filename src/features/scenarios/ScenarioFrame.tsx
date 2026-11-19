import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Hourglass } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/ui/misc';
import { PENDING_NOTE } from './scenarioMeta';

export function ScenarioFrame({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div>
      <Link to="/scenarios" className="mb-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />All scenarios
      </Link>
      <PageHeader title={title} description={description} />
      {children}
    </div>
  );
}

export function PendingContent({ what }: { what: string }) {
  return (
    <EmptyState title={`No ${what} available yet`} icon={<Hourglass className="h-8 w-8" aria-hidden />}>
      {PENDING_NOTE}
    </EmptyState>
  );
}
