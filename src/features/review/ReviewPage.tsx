import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, Crosshair, GitCompareArrows, Layers, PlusCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import { content } from '@/content';
import { db } from '@/db/db';
import { addToDeck } from '@/db/repo';
import { useLearnerModel } from '@/db/learnerModel';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState, PageHeader, Spinner } from '@/components/ui/misc';
import { Expandable, ReviewBody, snippet } from '../practice/parts';
import { startReviewSession } from '../practice/practiceService';
import { groupBySection, loadMissed, type MissedItem } from './reviewService';

const MODE_LABEL: Record<string, string> = {
  learn: 'Learn and Answer', topic: 'Topic quiz', mixed: 'Mixed quiz', weakness: 'Weakness drill', rapid: 'Rapid fire', tricky: 'Tricky questions',
  explain: 'Explain your answer', exam: 'Mock exam', review: 'Review', diagnostic: 'Diagnostic', 'lesson-quiz': 'Lesson quiz',
};

export default function ReviewPage() {
  const nav = useNavigate();
  const model = useLearnerModel();
  const missed = useLiveQuery(() => loadMissed(), []);
  const inDeck = useLiveQuery(async () => new Set((await db.cards.filter((c) => c.inDeck).toArray()).map((c) => c.termId)), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!model || missed === undefined) return <Spinner label="Loading your review" />;

  const groups = groupBySection(missed);
  const weak = model.weakConcepts.slice(0, 12);
  const pairs = model.confusedPairs.slice(0, 8);

  async function practice(items: MissedItem[], key: string, title?: string) {
    setBusy(key); setError(null);
    try {
      const r = await startReviewSession(items.map((i) => i.question.id), title);
      if (r) nav(`/practice/session/${r.id}`); else { setError('Those questions are no longer available.'); setBusy(null); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start the session'); setBusy(null); }
  }

  const nothing = missed.length === 0 && weak.length === 0 && pairs.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Weakness Review" description="Everything you most recently got wrong, the concepts that need work, and the terms you tend to mix up."
        actions={<ButtonLink to="/practice?mode=weakness" data-testid="start-weakness-drill"><Crosshair className="h-4 w-4" aria-hidden />Start weakness drill</ButtonLink>} />

      {nothing && (
        <EmptyState title="Nothing to review yet" action={<ButtonLink to="/practice">Start practicing</ButtonLink>}>
          Questions you miss will appear here, grouped by section. A question leaves this list once you answer it correctly.
        </EmptyState>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <section aria-labelledby="missed-h" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="missed-h" className="text-lg font-semibold">Questions to revisit {missed.length > 0 && <Badge tone="danger" className="ml-1 align-middle">{missed.length}</Badge>}</h2>
          {missed.length > 0 && <Button onClick={() => void practice(missed, 'all', `Review of missed questions (${missed.length})`)} disabled={busy !== null} data-testid="practice-missed-again"><RotateCcw className="h-4 w-4" aria-hidden />{busy === 'all' ? 'Starting…' : `Practice these again (${missed.length})`}</Button>}
        </div>
        {missed.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border border-border bg-surface p-4 text-sm text-muted"><CheckCircle2 className="h-4 w-4 text-success" aria-hidden />No missed questions right now. Questions you answer wrong will be listed here until you get them right.</p>
        ) : (
          groups.map((g) => (
            <Card key={g.sectionId} data-testid="missed-group">
              <CardHeader as="h3" title={<span className="flex flex-wrap items-center gap-2">{g.name}<Badge tone="danger">{g.items.length}</Badge></span>}
                action={<Button size="sm" variant="outline" onClick={() => void practice(g.items, g.sectionId, `Review: ${g.name} (${g.items.length})`)} disabled={busy !== null}>Practice these</Button>} />
              <CardBody className="space-y-2">
                {g.items.map((it) => {
                  const a = it.attempt;
                  return (
                    <Expandable key={it.question.id} testId="missed-item" header={
                      <span>
                        <span className="block text-sm font-medium">{snippet(it.question, 140)}</span>
                        <span className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                          <span>Last attempt {new Date(a.at).toLocaleDateString()} · {MODE_LABEL[a.mode] ?? a.mode}</span>
                          {a.choiceId === null && <Badge tone="warning">Not answered</Badge>}
                        </span>
                      </span>
                    }>
                      <ReviewBody question={it.question} order={orderFor(it)} selected={a.choiceId} />
                    </Expandable>
                  );
                })}
              </CardBody>
            </Card>
          ))
        )}
      </section>

      <section aria-labelledby="weak-h" className="space-y-3">
        <h2 id="weak-h" className="text-lg font-semibold">Weakest concepts</h2>
        {weak.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">No weak concepts detected yet. As you answer questions and review flashcards, concepts with low mastery are listed here.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2" data-testid="weak-concepts">
            {weak.map((w) => {
              const lesson = content.lessonsByTerm.get(w.id)?.[0];
              const added = inDeck?.has(w.id);
              return (
                <li key={w.id} className="rounded-xl border border-border bg-surface p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/dictionary/${w.id}`} className="font-medium text-primary hover:underline">{w.name}</Link>
                    <span className="shrink-0 text-xs tabular-nums text-muted" title="Mastery estimate">{Math.round(w.score * 100)}% · {w.attempts} attempt{w.attempts === 1 ? '' : 's'}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <Link to={`/dictionary/${w.id}`} className="inline-flex items-center gap-1 text-primary hover:underline"><BookOpen className="h-3.5 w-3.5" aria-hidden />Dictionary</Link>
                    {lesson && <Link to={`/lesson/${lesson.id}`} className="inline-flex items-center gap-1 text-primary hover:underline"><BookOpen className="h-3.5 w-3.5" aria-hidden />Lesson</Link>}
                    {added
                      ? <span className="inline-flex items-center gap-1 text-success"><Layers className="h-3.5 w-3.5" aria-hidden />In flashcards</span>
                      : <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => void addToDeck([w.id], 'manual')} aria-label={`Add ${w.name} to flashcards`}><PlusCircle className="h-3.5 w-3.5" aria-hidden />Add to flashcards</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="pairs-h" className="space-y-3">
        <h2 id="pairs-h" className="text-lg font-semibold">Terms you mix up</h2>
        {pairs.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">No confused pairs yet. When you pick an answer that is really a different term, the pair is shown here with a side-by-side comparison.</p>
        ) : (
          <ul className="space-y-2" data-testid="confused-pairs">
            {pairs.map((p) => (
              <li key={`${p.a}|${p.b}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3">
                <span className="min-w-0 flex-1 text-sm"><strong>{p.aName}</strong> vs <strong>{p.bName}</strong><span className="ml-2 text-xs text-muted">mixed up {p.count} time{p.count === 1 ? '' : 's'}</span></span>
                <ButtonLink to={`/dictionary/compare?a=${p.a}&b=${p.b}`} size="sm" variant="outline"><GitCompareArrows className="h-4 w-4" aria-hidden />Compare</ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function orderFor(it: MissedItem): string[] {
  // Show choices in a stable order for review (the original display order of past sessions is not kept per attempt).
  return it.question.choices.map((c) => c.id);
}
