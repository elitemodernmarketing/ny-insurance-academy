import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight, Layers, Scale } from 'lucide-react';
import { content } from '@/content';
import { addToDeck } from '@/db/repo';
import { useStudyTimer } from '@/db/hooks';
import { PageHeader, EmptyState } from '@/components/ui/misc';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { GlossaryTerm } from '@/content/schema';
import { TermPicker } from './TermPicker';
import { getTerm } from './termHelpers';
import { findComparison } from './search';

export default function ComparePage() {
  useStudyTimer('dictionary');
  const [params, setParams] = useSearchParams();
  const aId = params.get('a') ?? undefined;
  const bId = params.get('b') ?? undefined;
  const a = aId ? getTerm(aId) : undefined;
  const b = bId ? getTerm(bId) : undefined;
  const [added, setAdded] = useState<string | null>(null);

  const set = (k: 'a' | 'b', v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };
  const swap = () => {
    const next = new URLSearchParams();
    if (bId) next.set('a', bId);
    if (aId) next.set('b', aId);
    setParams(next, { replace: true });
  };
  const curated = useMemo(() => (a && b ? findComparison(a.id, b.id) : undefined), [a, b]);
  const suggestions = (t?: GlossaryTerm) => (t ? [...t.confusedWith, ...t.related] : []);

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm">
        <Link to="/dictionary" className="inline-flex items-center gap-1 text-primary hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Dictionary</Link>
      </nav>
      <PageHeader title="Compare terms" description="Put two easily-confused terms side by side." />

      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
        <TermPicker label="First term" value={aId} onChange={(id) => set('a', id)} excludeId={bId} testId="compare-picker-a" suggestions={suggestions(b)} />
        <Button variant="outline" size="icon" onClick={swap} aria-label="Swap terms" className="mx-auto" data-testid="compare-swap" disabled={!aId && !bId}>
          <ArrowLeftRight className="h-4 w-4" aria-hidden />
        </Button>
        <TermPicker label="Second term" value={bId} onChange={(id) => set('b', id)} excludeId={aId} testId="compare-picker-b" suggestions={suggestions(a)} />
      </div>

      {!a || !b ? (
        <div className="mt-6 space-y-4">
          {(aId && !a) || (bId && !b) ? <p role="alert" className="text-sm text-danger">One of the selected terms could not be found. Pick another.</p> : null}
          <EmptyState title="Choose two terms to compare" icon={<Scale className="h-8 w-8" aria-hidden />}>
            Search for a term in each box above, or start from a commonly confused pair.
          </EmptyState>
          {content.comparisons.length > 0 && (
            <Card>
              <CardHeader title="Commonly confused pairs" />
              <CardBody>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {content.comparisons.slice(0, 12).map((c) => (
                    <li key={`${c.a}|${c.b}`}>
                      <Link to={`/dictionary/compare?a=${c.a}&b=${c.b}`} className="block rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2">
                        <span className="font-medium">{content.termById.get(c.a)?.term}</span> <span className="text-muted">vs</span> <span className="font-medium">{content.termById.get(c.b)?.term}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-6" data-testid="compare-result">
          {curated && (
            <section aria-labelledby="curated-h" className="rounded-xl border border-primary/40 bg-primary/5 p-4 sm:p-5">
              <h2 id="curated-h" className="flex items-center gap-2 text-base font-semibold"><Scale className="h-4 w-4 text-primary" aria-hidden />Key difference</h2>
              <p className="mt-1 leading-7" data-testid="key-difference">{curated.keyDifference}</p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[28rem] border-collapse text-sm">
                  <caption className="sr-only">Comparison of {a.term} and {b.term}</caption>
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="p-2 font-semibold text-muted">Aspect</th>
                      <th scope="col" className="p-2 font-semibold">{a.term}</th>
                      <th scope="col" className="p-2 font-semibold">{b.term}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {curated.rows.map((r) => (
                      <tr key={r.aspect} className="border-b border-border/60 align-top">
                        <th scope="row" className="p-2 text-left font-medium">{r.aspect}</th>
                        <td className="p-2">{curated.swapped ? r.b : r.a}</td>
                        <td className="p-2">{curated.swapped ? r.a : r.b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {curated.memoryTip && <p className="mt-3 rounded-lg bg-accent/10 p-3 text-sm"><span className="font-semibold">Memory tip: </span>{curated.memoryTip}</p>}
            </section>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {[a, b].map((t) => <TermColumn key={t.id} t={t} />)}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={async () => { const n = await addToDeck([a.id, b.id], 'manual'); setAdded(n > 0 ? `Added ${n} new card${n === 1 ? '' : 's'} to your flashcards.` : 'Both terms are already in your flashcards.'); }} data-testid="add-both">
              <Layers className="h-4 w-4" aria-hidden />Add both to flashcards
            </Button>
            <span role="status" aria-live="polite" className="text-sm text-muted">{added}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TermColumn({ t }: { t: GlossaryTerm }) {
  const sec = content.sectionById.get(t.sectionId);
  const rows: [string, string][] = [
    ['Formal definition', t.formal],
    ['Plain English', t.plain],
    ['Example', t.examples[0]],
    ['Exam tip', t.examTip],
    ['Common misunderstanding', t.misconception],
  ];
  return (
    <Card>
      <CardHeader as="h2" title={<Link to={`/dictionary/${t.id}`} className="text-primary hover:underline">{t.term}</Link>} action={sec ? <Badge>{sec.shortName}</Badge> : undefined} />
      <CardBody>
        <dl className="space-y-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{k}</dt>
              <dd className="mt-0.5 leading-6">{v}</dd>
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  );
}
