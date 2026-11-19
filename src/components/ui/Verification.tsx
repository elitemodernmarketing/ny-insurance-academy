import { ShieldCheck, BadgeCheck, FileWarning, ExternalLink } from 'lucide-react';
import type { Verification } from '@/content/schema';
import { content } from '@/content';
import { Badge } from './Badge';
import { Tooltip } from './Tooltip';

/** Shows how a record was verified, and lists its sources. */
export function VerificationBadge({ v, nySpecific }: { v: Verification; nySpecific?: boolean }) {
  const tip =
    v.status === 'verified' ? `Checked against a primary source (${v.method.replace('-', ' ')}) on ${v.checkedOn}.`
    : v.status === 'reviewed' ? `General insurance principle, reviewed ${v.checkedOn}. Not state-specific law.`
    : 'Draft — not yet verified; excluded from practice and exams.';
  return (
    <Tooltip content={tip}>
      <span tabIndex={0} className="inline-flex">
        {v.status === 'verified' ? <Badge tone="success"><ShieldCheck className="h-3 w-3" aria-hidden />Verified{nySpecific ? ' · NY law' : ''}</Badge>
          : v.status === 'reviewed' ? <Badge tone="info"><BadgeCheck className="h-3 w-3" aria-hidden />Reviewed</Badge>
          : <Badge tone="warning"><FileWarning className="h-3 w-3" aria-hidden />Draft</Badge>}
      </span>
    </Tooltip>
  );
}

export function SourceList({ ids, className }: { ids: string[]; className?: string }) {
  const srcs = ids.map((id) => content.sourceById.get(id)).filter(Boolean);
  if (!srcs.length) return null;
  return (
    <div className={className}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">Sources</div>
      <ul className="mt-1 space-y-1 text-sm">
        {srcs.map((s) => (
          <li key={s!.id} className="text-muted">
            {s!.url ? (
              <a href={s!.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                {s!.title}<ExternalLink className="h-3 w-3" aria-hidden /><span className="sr-only">(opens in new tab)</span>
              </a>
            ) : <span>{s!.title}</span>}
            {s!.retrievedOn && <span className="ml-1 text-xs">· retrieved {s!.retrievedOn}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
