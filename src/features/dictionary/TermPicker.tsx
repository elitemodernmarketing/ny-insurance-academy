import { useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { content } from '@/content';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getTerm } from './termHelpers';
import { searchTerms } from './search';

/** Searchable single-term picker. Shows the chosen term with a "Change" button, or a search box with results. */
export function TermPicker({ label, value, onChange, excludeId, testId, suggestions = [] }: {
  label: string;
  value: string | undefined;
  onChange: (termId: string) => void;
  excludeId?: string;
  testId?: string;
  suggestions?: string[];
}) {
  const term = value ? getTerm(value) : undefined;
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const inputId = useId();
  const results = useMemo(
    () => (query.trim() ? searchTerms(content.terms, query).filter((t) => t.id !== excludeId).slice(0, 8) : []),
    [query, excludeId],
  );
  const suggested = suggestions.filter((s) => s !== excludeId).map(getTerm).filter((t): t is NonNullable<typeof t> => !!t).slice(0, 6);

  if (term && !editing) {
    return (
      <div className="rounded-xl border border-border bg-surface p-3" data-testid={testId ? `${testId}-selected` : undefined}>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
        <div className="mt-1 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold">{term.term}</div>
            <Badge className="mt-1">{content.sectionById.get(term.sectionId)?.shortName}</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setEditing(true); setQuery(''); }} aria-label={`Change ${label}`}>Change</Button>
        </div>
      </div>
    );
  }

  const pick = (id: string) => { onChange(id); setEditing(false); setQuery(''); };
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <label htmlFor={inputId} className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</label>
      <div className="relative mt-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a term…"
          autoComplete="off"
          data-testid={testId}
          className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-fg placeholder:text-muted"
        />
      </div>
      {results.length > 0 ? (
        <ul className="mt-2 divide-y divide-border rounded-lg border border-border" aria-label={`${label} results`}>
          {results.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => pick(t.id)} className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-surface-2" data-testid="picker-result">
                <span className="text-sm font-medium">{t.term}</span>
                <span className="line-clamp-1 text-xs text-muted">{t.plain}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim() ? (
        <p className="mt-2 text-sm text-muted" role="status">No terms match “{query}”.</p>
      ) : suggested.length > 0 ? (
        <div className="mt-2">
          <div className="mb-1 text-xs text-muted">Suggestions</div>
          <div className="flex flex-wrap gap-2">
            {suggested.map((t) => (
              <button key={t.id} type="button" onClick={() => pick(t.id)} className="rounded-full border border-border px-3 py-1 text-sm hover:bg-surface-2">{t.term}</button>
            ))}
          </div>
        </div>
      ) : null}
      {term && editing && <Button size="sm" variant="ghost" className="mt-2" onClick={() => setEditing(false)}>Cancel</Button>}
    </div>
  );
}
