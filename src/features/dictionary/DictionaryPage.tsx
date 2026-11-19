import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, X, Scale, ChevronRight, BookA } from 'lucide-react';
import { content } from '@/content';
import { db } from '@/db/db';
import { useLearnerModel } from '@/db/learnerModel';
import { useStudyTimer } from '@/db/hooks';
import { PageHeader, EmptyState, Select } from '@/components/ui/misc';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { filterTerms, groupAZ, searchTerms, type TermFilters } from './search';
import { MasteryBadge } from './MasteryBadge';
import { DOMAIN_LABEL, termNames, normalizeText, type StatusBucket } from './termHelpers';

const PAGE_CAP = 300;

export default function DictionaryPage() {
  useStudyTimer('dictionary');
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const sectionId = params.get('section') ?? '';
  const domain = params.get('domain') ?? '';
  const difficulty = params.get('difficulty') ?? '';
  const status = (params.get('status') ?? '') as StatusBucket | '';
  const difficultOnly = params.get('difficult') === '1';
  const inDeckOnly = params.get('deck') === '1';
  const [showAll, setShowAll] = useState(false);
  const [showAllComparisons, setShowAllComparisons] = useState(false);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
    setShowAll(false);
  };

  const model = useLearnerModel();
  const statusRows = useLiveQuery(() => db.termStatus.toArray(), []);
  const cardRows = useLiveQuery(() => db.cards.toArray(), []);
  const difficult = useMemo(() => new Set((statusRows ?? []).filter((r) => r.difficult).map((r) => r.termId)), [statusRows]);
  const deck = useMemo(() => new Set((cardRows ?? []).filter((c) => c.inDeck).map((c) => c.termId)), [cardRows]);

  const deferredQ = useDeferredValue(q);
  const filters: TermFilters = {
    sectionId: sectionId || undefined,
    domain: domain || undefined,
    difficulty: difficulty ? Number(difficulty) : undefined,
    status: status || undefined,
    difficultOnly, inDeckOnly,
  };
  const filtersKey = JSON.stringify(filters);
  const results = useMemo(() => {
    const filtered = filterTerms(content.terms, filters, { level: (id) => model?.mastery.get(id)?.level, difficult, deck });
    return searchTerms(filtered, deferredQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, deferredQ, model, difficult, deck]);

  const searching = normalizeText(deferredQ) !== '';
  const shown = showAll ? results : results.slice(0, PAGE_CAP);
  const groups = useMemo(() => (searching ? [] : groupAZ(shown)), [searching, shown]);
  const anyFilter = !!(sectionId || domain || difficulty || status || difficultOnly || inDeckOnly || q);

  const comparisons = useMemo(() => {
    const nq = normalizeText(deferredQ);
    const list = content.comparisons.filter((c) => {
      if (!nq) return true;
      const a = content.termById.get(c.a), b = content.termById.get(c.b);
      return [a, b].some((t) => t && termNames(t).some((n) => normalizeText(n).includes(nq)));
    });
    return list;
  }, [deferredQ]);

  if (content.terms.length === 0)
    return (
      <div>
        <PageHeader title="Insurance dictionary" description="Plain-English and formal definitions for every exam term." />
        <EmptyState title="The glossary is still being written" icon={<BookA className="h-8 w-8" aria-hidden />}>
          No glossary terms are available yet. Check back soon, or start with the curriculum lessons.
        </EmptyState>
      </div>
    );

  return (
    <div>
      <PageHeader
        title="Insurance dictionary"
        description={`${content.terms.length} exam terms with formal and plain-English definitions, examples and exam tips.`}
        actions={<Link to="/dictionary/compare" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-2"><Scale className="h-4 w-4" aria-hidden />Compare terms</Link>}
      />

      <Card className="mb-4 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setParam('q', e.target.value)}
            placeholder="Search terms, aliases or definitions…"
            aria-label="Search the dictionary"
            data-testid="term-search"
            autoComplete="off"
            className="h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-11 text-base text-fg placeholder:text-muted"
          />
          {q && (
            <button type="button" aria-label="Clear search" onClick={() => setParam('q', '')} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-surface-2">
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Section" value={sectionId} onChange={(e) => setParam('section', e.target.value)} data-testid="filter-section">
            <option value="">All sections</option>
            {content.sections.map((s) => <option key={s.id} value={s.id}>{s.shortName}</option>)}
          </Select>
          <Select label="Domain" value={domain} onChange={(e) => setParam('domain', e.target.value)}>
            <option value="">All domains</option>
            {Object.entries(DOMAIN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select label="Difficulty" value={difficulty} onChange={(e) => setParam('difficulty', e.target.value)}>
            <option value="">Any difficulty</option>
            <option value="1">Foundational</option>
            <option value="2">Intermediate</option>
            <option value="3">Advanced</option>
          </Select>
          <Select label="My status" value={status} onChange={(e) => setParam('status', e.target.value)}>
            <option value="">Any status</option>
            <option value="unseen">Unseen</option>
            <option value="learning">Learning</option>
            <option value="mastered">Mastered</option>
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={difficultOnly} onChange={(e) => setParam('difficult', e.target.checked ? '1' : '')} />
            Marked difficult
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={inDeckOnly} onChange={(e) => setParam('deck', e.target.checked ? '1' : '')} />
            In my flashcards
          </label>
          {anyFilter && <Button size="sm" variant="ghost" onClick={() => { setParams(new URLSearchParams(), { replace: true }); setShowAll(false); }}>Clear all</Button>}
          <span className="ml-auto text-muted" role="status" aria-live="polite" data-testid="result-count">
            {results.length} {results.length === 1 ? 'term' : 'terms'}{searching ? ' · best matches first' : ''}
          </span>
        </div>
      </Card>

      {comparisons.length > 0 && (
        <section aria-labelledby="confused-h" className="mb-6 rounded-xl border border-border bg-surface p-4">
          <h2 id="confused-h" className="flex items-center gap-2 text-base font-semibold"><Scale className="h-4 w-4 text-primary" aria-hidden />Commonly confused</h2>
          <p className="mb-3 text-sm text-muted">Pairs of terms the exam loves to mix up. Open one to see the difference side by side.</p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(showAllComparisons ? comparisons : comparisons.slice(0, 6)).map((c) => (
              <li key={`${c.a}|${c.b}`}>
                <Link to={`/dictionary/compare?a=${c.a}&b=${c.b}`} className="flex h-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2">
                  <span className="min-w-0"><span className="font-medium">{content.termById.get(c.a)?.term}</span> <span className="text-muted">vs</span> <span className="font-medium">{content.termById.get(c.b)?.term}</span></span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {comparisons.length > 6 && (
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setShowAllComparisons((v) => !v)}>
              {showAllComparisons ? 'Show fewer' : `Show all ${comparisons.length} comparisons`}
            </Button>
          )}
        </section>
      )}

      {results.length === 0 ? (
        <EmptyState title="No terms match" icon={<Search className="h-8 w-8" aria-hidden />} action={anyFilter ? <Button variant="outline" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear search and filters</Button> : undefined}>
          Try a different spelling, a broader search, or remove a filter.
        </EmptyState>
      ) : searching ? (
        <ul className="grid gap-2" data-testid="term-results">
          {shown.map((t) => <TermRow key={t.id} id={t.id} level={model?.mastery.get(t.id)?.level} />)}
        </ul>
      ) : (
        <div data-testid="term-results">
          <nav aria-label="Jump to letter" className="mb-4 flex flex-wrap gap-1">
            {groups.map((g) => <a key={g.letter} href={`#letter-${g.letter}`} className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-sm font-medium hover:bg-surface-2">{g.letter}</a>)}
          </nav>
          {groups.map((g) => (
            <section key={g.letter} aria-labelledby={`letter-${g.letter}`} className="mb-6">
              <h2 id={`letter-${g.letter}`} className="mb-2 border-b border-border pb-1 text-lg font-bold text-primary">{g.letter}</h2>
              <ul className="grid gap-2">{g.terms.map((t) => <TermRow key={t.id} id={t.id} level={model?.mastery.get(t.id)?.level} />)}</ul>
            </section>
          ))}
        </div>
      )}
      {!showAll && results.length > PAGE_CAP && (
        <div className="mt-4 text-center"><Button variant="outline" onClick={() => setShowAll(true)}>Show all {results.length} terms</Button></div>
      )}
    </div>
  );
}

function TermRow({ id, level }: { id: string; level: import('@/lib/mastery').MasteryLevel | undefined }) {
  const t = content.termById.get(id)!;
  const sec = content.sectionById.get(t.sectionId);
  return (
    <li>
      <Link to={`/dictionary/${t.id}`} className="block rounded-xl border border-border bg-surface p-3 transition-colors hover:border-primary/50 hover:bg-surface-2 sm:p-4" data-testid="term-result">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold">{t.term}</span>
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {sec && <Badge>{sec.shortName}</Badge>}
            <MasteryBadge level={level} />
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">{t.plain}</p>
      </Link>
    </li>
  );
}
