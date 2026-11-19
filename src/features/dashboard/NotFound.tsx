import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/misc';

export default function NotFound() {
  return (
    <EmptyState title="Page not found" action={<ButtonLink to="/">Go to dashboard</ButtonLink>}>
      This page doesn't exist. It may have been a link to content that was renamed.
    </EmptyState>
  );
}
