import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import type { OutlineNode } from '@/content/schema';
import { content } from '@/content';
import { cn } from '@/components/ui/cn';
import { outlineCoverage, type OutlineEntry } from './helpers';

/** The official exam outline for a section, marking which nodes lessons cover. */
export function OutlineTree({ nodes }: { nodes: OutlineNode[] }) {
  const cov = outlineCoverage(nodes, content.lessonsByOutline);
  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
        <li className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />Covered by a lesson</li>
        <li className="inline-flex items-center gap-1"><CircleDot className="h-3.5 w-3.5 text-warning" aria-hidden />Some sub-topics covered</li>
        <li className="inline-flex items-center gap-1"><Circle className="h-3.5 w-3.5" aria-hidden />No lesson yet</li>
      </ul>
      <Level nodes={nodes} cov={cov} />
    </div>
  );
}

function Level({ nodes, cov }: { nodes: OutlineNode[]; cov: Map<string, OutlineEntry> }) {
  return (
    <ul className="space-y-1">
      {nodes.map((n) => {
        const e = cov.get(n.id);
        const c = e?.coverage ?? 'none';
        return (
          <li key={n.id}>
            <div className="flex flex-wrap items-start gap-x-2 gap-y-0.5 text-sm">
              {c === 'covered' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Covered by a lesson" />
                : c === 'partial' ? <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-label="Some sub-topics covered" />
                : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-label="No lesson yet" />}
              <span className={cn(c === 'none' && 'text-muted')}>{n.title}</span>
              {n.refs && <span className="text-xs text-muted">§{n.refs}</span>}
              {e && e.lessons.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {e.lessons.slice(0, 3).map((l) => (
                    <Link key={l.id} to={`/lesson/${l.id}`} title={l.title} className="rounded bg-primary/10 px-1.5 text-xs font-medium text-primary hover:underline">Lesson {l.order}</Link>
                  ))}
                </span>
              )}
            </div>
            {n.children && n.children.length > 0 && <div className="ml-2 mt-1 border-l border-border pl-3"><Level nodes={n.children} cov={cov} /></div>}
          </li>
        );
      })}
    </ul>
  );
}
