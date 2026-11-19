import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { content } from '@/content';
import { addToDeck } from '@/db/repo';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Select } from '@/components/ui/misc';
import { Badge } from '@/components/ui/Badge';

/** Browse a section's terms and add all (or some) to the flashcard deck. */
export function AddCards({ deck, initialSection = '' }: { deck: ReadonlySet<string>; initialSection?: string }) {
  const [sectionId, setSectionId] = useState(initialSection);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');
  const terms = useMemo(() => (sectionId ? content.termsBySection.get(sectionId) ?? [] : []), [sectionId]);
  const addable = terms.filter((t) => !deck.has(t.id));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const add = async (ids: string[]) => {
    const n = await addToDeck(ids, 'manual');
    setMsg(n > 0 ? `Added ${n} card${n === 1 ? '' : 's'} to your deck.` : 'Those terms are already in your deck.');
    setPicked(new Set());
  };
  return (
    <Card id="add-cards" data-testid="add-cards">
      <CardHeader title="Add cards" description="Pick a section, then add every term or just the ones you choose." />
      <CardBody>
        <div className="max-w-sm">
          <Select label="Section" value={sectionId} onChange={(e) => { setSectionId(e.target.value); setPicked(new Set()); setMsg(''); }} data-testid="add-section">
            <option value="">Choose a section…</option>
            {content.sections.map((s) => <option key={s.id} value={s.id}>{s.shortName} ({content.termsBySection.get(s.id)?.length ?? 0})</option>)}
          </Select>
        </div>
        {sectionId && terms.length === 0 && <p className="mt-3 text-sm text-muted">No glossary terms are available for this section yet.</p>}
        {terms.length > 0 && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void add(addable.map((t) => t.id))} disabled={addable.length === 0} data-testid="add-all-section">
                <Plus className="h-4 w-4" aria-hidden />Add all ({addable.length})
              </Button>
              <Button size="sm" variant="outline" onClick={() => void add([...picked])} disabled={picked.size === 0} data-testid="add-selected">Add selected ({picked.size})</Button>
              <span className="text-sm text-muted">{terms.length - addable.length} of {terms.length} already in your deck</span>
            </div>
            <ul className="mt-3 max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border" aria-label="Terms in this section">
              {terms.map((t) => {
                const inDeck = deck.has(t.id);
                return (
                  <li key={t.id}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-surface-2">
                      <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--primary))]" disabled={inDeck} checked={inDeck || picked.has(t.id)} onChange={() => toggle(t.id)} aria-label={`Select ${t.term}`} />
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-medium">{t.term}</span>
                        <span className="line-clamp-1 block text-xs text-muted">{t.plain}</span>
                      </span>
                      {inDeck && <Badge tone="success">In deck</Badge>}
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <div role="status" aria-live="polite" className="mt-2 text-sm text-success">{msg}</div>
      </CardBody>
    </Card>
  );
}
