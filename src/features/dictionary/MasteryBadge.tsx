import { Badge } from '@/components/ui/Badge';
import type { MasteryLevel } from '@/lib/mastery';
import { MASTERY_LABEL, MASTERY_TONE } from './termHelpers';

export function MasteryBadge({ level }: { level: MasteryLevel | undefined }) {
  const l = level ?? 'unseen';
  return <Badge tone={MASTERY_TONE[l]}>{MASTERY_LABEL[l]}</Badge>;
}
