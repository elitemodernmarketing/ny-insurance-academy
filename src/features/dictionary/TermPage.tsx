import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Layers, Lightbulb, Scale, Sparkles, Star, XCircle, Shuffle, Flag, Plus, Check } from 'lucide-react';
import { content } from '@/content';
import { db } from '@/db/db';
import { addToDeck, noteTermViewed, recordAttempt, removeFromDeck, updateTermStatus } from '@/db/repo';
import { useLearnerModel } from '@/db/learnerModel';
import { useStudyTimer } from '@/db/hooks';
import { rngFrom, shuffle } from '@/lib/rng';
import { PageHeader, EmptyState } from '@/components/ui/misc';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { SpeakButton } from '@/components/ui/Speak';
import { SourceList, VerificationBadge } from '@/components/ui/Verification';
import { cn } from '@/components/ui/cn';
import type { GlossaryTerm } from '@/content/schema';
import { MasteryBadge } from './MasteryBadge';
import { TermPicker } from './TermPicker';
import { confusedTermFor, getTerm, DIFFICULTY_LABEL, questionCountForTerm } from './termHelpers';
import { MASTERY_EXPLAIN } from './masteryText';

export default function TermPage() {
  useStudyTimer('dictionary');
  const { termId = '' } = useParams();
  const term = getTerm(termId);

  useEffect(() => { if (term) void noteTermViewed(term.id); }, [term?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!term)
    return (
      <EmptyState title="Term not found" action={<ButtonLink to="/dictionary" variant="outline">Back to dictionary</ButtonLink>}>
        We couldn’t find “{termId}”. It may not be published yet.
      </EmptyState>
    );
  return <TermView key={term.id} term={term} />;
}

function Section({ title, icon, children, className }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader title={<span className="flex items-center gap-2">{icon}{title}</span>} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function TermView({ term }: { term: GlossaryTerm }) {
  const navigate = useNavigate();
  const section = content.sectionById.get(term.sectionId);
  const model = useLearnerModel();
  const mastery = model?.mastery.get(term.id);
  const status = useLiveQuery(() => db.termStatus.get(term.id), [term.id]);
  const card = useLiveQuery(async () => (await db.cards.get(term.id)) ?? null, [term.id]);
  const inDeck = !!card?.inDeck;

  const [showSimpler, setShowSimpler] = useState(false);
  const [exampleIdx, setExampleIdx] = useState(0);
  const [comparing, setComparing] = useState(false);

  const idx = content.terms.findIndex((t) => t.id === term.id);
  const prev = idx > 0 ? content.terms[idx - 1] : undefined;
  const next = idx >= 0 && idx < content.terms.length - 1 ? content.terms[idx + 1] : undefined;
  const lessons = content.lessonsByTerm.get(term.id) ?? [];
  const outlinePaths = term.outlineIds.map((o) => content.outline.get(o)).filter((o): o is NonNullable<typeof o> => !!o);
  const compareSuggestions = useMemo(() => {
    const fromComparisons = content.comparisons.filter((c) => c.a === term.id || c.b === term.id).map((c) => (c.a === term.id ? c.b : c.a));
    return [...new Set([...term.confusedWith, ...fromComparisons, ...term.related])].filter((i) => i !== term.id);
  }, [term]);
  const relatedTerms = term.related.map(getTerm).filter((t): t is GlossaryTerm => !!t);
  const confusedTerms = term.confusedWith.map(getTerm).filter((t): t is GlossaryTerm => !!t);
  const qCount = questionCountForTerm(term.id);

  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm">
        <Link to="/dictionary" className="inline-flex items-center gap-1 text-primary hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Dictionary</Link>
      </nav>
      <PageHeader
        eyebrow={section?.name}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {term.term}
            <SpeakButton text={term.term} label={`Pronounce ${term.term}`} />
          </span>
        }
        description={term.pronunciation ? <span>Pronounced: <span className="font-mono">{term.pronunciation}</span></span> : undefined}
      />
      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-2">
        {section && <Link to={`/dictionary?section=${section.id}`}><Badge tone="primary">{section.shortName}</Badge></Link>}
        <Badge tone={term.difficulty === 3 ? 'warning' : term.difficulty === 2 ? 'info' : 'neutral'}>{DIFFICULTY_LABEL[term.difficulty]}</Badge>
        {term.nySpecific && <Badge tone="primary">NY law</Badge>}
        <MasteryBadge level={mastery?.level} />
        {status?.difficult && <Badge tone="warning"><Flag className="h-3 w-3" aria-hidden />Marked difficult</Badge>}
        <VerificationBadge v={term.verification} nySpecific={term.nySpecific} />
        {term.aliases.length > 0 && <span className="text-sm text-muted">Also called: {term.aliases.join(', ')}</span>}
      </div>

      <div className="space-y-4">
        <Section title="Plain-English definition" icon={<Sparkles className="h-4 w-4 text-accent" aria-hidden />}>
          <div className="flex items-start gap-2">
            <p className="flex-1 text-lg leading-7" data-testid="plain-def">{term.plain}</p>
            <SpeakButton text={term.plain} label="Read plain definition aloud" />
          </div>
          {showSimpler && (
            <div className="mt-3 rounded-lg bg-accent/10 p-3 text-sm leading-6" role="region" aria-label="Simpler explanation" data-testid="simpler">
              <span className="font-semibold">Think of it this way: </span>{term.simpler}
            </div>
          )}
        </Section>

        <Section title="Formal definition" icon={<BookOpen className="h-4 w-4 text-primary" aria-hidden />}>
          <div className="flex items-start gap-2">
            <p className="flex-1 leading-7">{term.formal}</p>
            <SpeakButton text={term.formal} label="Read formal definition aloud" />
          </div>
        </Section>

        <Card className="p-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Term actions">
            <Button variant="outline" size="sm" aria-pressed={showSimpler} onClick={() => setShowSimpler((v) => !v)} data-testid="explain-simpler">
              <Sparkles className="h-4 w-4" aria-hidden />{showSimpler ? 'Hide simpler explanation' : 'Explain more simply'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setExampleIdx((i) => (i + 1) % term.examples.length)} data-testid="another-example">
              <Shuffle className="h-4 w-4" aria-hidden />Show another example
            </Button>
            <Button variant="outline" size="sm" aria-expanded={comparing} onClick={() => setComparing((v) => !v)} data-testid="compare-toggle">
              <Scale className="h-4 w-4" aria-hidden />Compare with another term
            </Button>
            {inDeck ? (
              <Button variant="secondary" size="sm" onClick={() => void removeFromDeck(term.id)} data-testid="add-to-flashcards" aria-label="In flashcards — click to remove">
                <Check className="h-4 w-4 text-success" aria-hidden />In flashcards
              </Button>
            ) : (
              <Button size="sm" onClick={() => void addToDeck([term.id], 'manual')} data-testid="add-to-flashcards">
                <Plus className="h-4 w-4" aria-hidden />Add to flashcards
              </Button>
            )}
            <Button variant={status?.difficult ? 'secondary' : 'outline'} size="sm" aria-pressed={!!status?.difficult} onClick={() => void updateTermStatus(term.id, { difficult: !status?.difficult })} data-testid="mark-difficult">
              <Flag className={cn('h-4 w-4', status?.difficult && 'text-warning')} aria-hidden />{status?.difficult ? 'Marked as difficult' : 'Mark as difficult'}
            </Button>
          </div>
          {comparing && (
            <div className="mt-4">
              <TermPicker
                label="Compare with"
                value={undefined}
                excludeId={term.id}
                testId="compare-picker"
                suggestions={compareSuggestions}
                onChange={(other) => navigate(`/dictionary/compare?a=${term.id}&b=${other}`)}
              />
            </div>
          )}
        </Card>

        <Section title={`Example${term.examples.length > 1 ? ` (${exampleIdx + 1} of ${term.examples.length})` : ''}`} icon={<Layers className="h-4 w-4 text-primary" aria-hidden />}>
          <p className="leading-7" aria-live="polite" data-testid="example-text">{term.examples[exampleIdx]}</p>
        </Section>

        <UnderstandingCheck term={term} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-accent/40 bg-accent/5 p-4">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Lightbulb className="h-4 w-4 text-accent" aria-hidden />Exam tip</h2>
            <p className="text-sm leading-6">{term.examTip}</p>
          </div>
          <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-warning" aria-hidden />Common misunderstanding</h2>
            <p className="text-sm leading-6">{term.misconception}</p>
          </div>
        </div>

        {(relatedTerms.length > 0 || confusedTerms.length > 0) && (
          <Section title="Related terms">
            {confusedTerms.length > 0 && (
              <div className="mb-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Often confused with</div>
                <div className="flex flex-wrap gap-2">
                  {confusedTerms.map((t) => (
                    <span key={t.id} className="inline-flex overflow-hidden rounded-full border border-warning/40 text-sm">
                      <Link to={`/dictionary/${t.id}`} className="px-3 py-1 hover:bg-surface-2">{t.term}</Link>
                      <Link to={`/dictionary/compare?a=${term.id}&b=${t.id}`} className="flex items-center border-l border-warning/40 px-2 text-warning hover:bg-surface-2" aria-label={`Compare with ${t.term}`}><Scale className="h-3.5 w-3.5" aria-hidden /></Link>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {relatedTerms.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">See also</div>
                <div className="flex flex-wrap gap-2">
                  {relatedTerms.map((t) => <Link key={t.id} to={`/dictionary/${t.id}`} className="rounded-full border border-border px-3 py-1 text-sm hover:bg-surface-2">{t.term}</Link>)}
                </div>
              </div>
            )}
          </Section>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Section title="How sure are you?" icon={<Star className="h-4 w-4 text-primary" aria-hidden />}>
            <p className="mb-2 text-sm text-muted">Rate your own confidence (1 = lost, 5 = could teach it).</p>
            <div role="radiogroup" aria-label="Personal confidence" className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => {
                const sel = status?.confidence === n;
                return (
                  <button key={n} type="button" role="radio" aria-checked={sel} aria-label={`${n} of 5`} data-testid={`confidence-${n}`}
                    onClick={() => void updateTermStatus(term.id, { confidence: sel ? null : (n as 1 | 2 | 3 | 4 | 5) })}
                    className={cn('flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-semibold transition-colors', sel ? 'border-primary bg-primary text-primary-fg' : 'border-border hover:bg-surface-2')}>
                    {n}
                  </button>
                );
              })}
            </div>
            {status?.confidence && <p className="mt-2 text-xs text-muted">You rated this {status.confidence}/5. Tap it again to clear.</p>}
          </Section>

          <Section title="My mastery" icon={<CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />}>
            <div className="mb-2 flex items-center gap-2"><MasteryBadge level={mastery?.level} />{mastery && mastery.attempts > 0 && <span className="text-sm tabular-nums text-muted">{Math.round(mastery.score * 100)}%</span>}</div>
            <p className="text-sm leading-6 text-muted">
              {MASTERY_EXPLAIN[mastery?.level ?? 'unseen']}
              {mastery && mastery.attempts > 0 && ` Based on ${mastery.attempts} answer${mastery.attempts === 1 ? '' : 's'} (${mastery.correct} correct, ${mastery.incorrect} missed).`}
            </p>
          </Section>
        </div>

        <Section title="Where it fits on the exam">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-semibold">Outline classification</dt>
              <dd className="mt-1 space-y-1 text-muted">
                {section && <div><Link to={`/learn/${section.id}`} className="text-primary hover:underline">{section.name}</Link> · {section.weightPct}% of the exam</div>}
                {outlinePaths.length > 0 ? outlinePaths.map((o) => <div key={o.id}>{o.path.join(' › ')}</div>) : <div>No outline path available.</div>}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Lessons teaching this term</dt>
              <dd className="mt-1">
                {lessons.length ? (
                  <ul className="space-y-1">{lessons.map((l) => <li key={l.id}><Link to={`/lesson/${l.id}`} className="text-primary hover:underline">{l.title}</Link></li>)}</ul>
                ) : <span className="text-muted">No lesson covers this term yet.</span>}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Practice questions</dt>
              <dd className="mt-1 text-muted">
                {qCount > 0 ? <>{qCount} question{qCount === 1 ? '' : 's'} in the bank test this term. </> : 'No bank questions test this term yet. '}
                {section && <Link to={`/practice?mode=topic&section=${section.id}`} className="text-primary hover:underline">Practice this section</Link>}
              </dd>
            </div>
          </dl>
        </Section>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-4">
          <SourceList ids={term.sources} />
          <VerificationBadge v={term.verification} nySpecific={term.nySpecific} />
        </div>

        <nav aria-label="Previous and next term" className="flex items-center justify-between gap-2">
          {prev ? <ButtonLink to={`/dictionary/${prev.id}`} variant="outline" size="sm" aria-label={`Previous term: ${prev.term}`}><ArrowLeft className="h-4 w-4" aria-hidden /><span className="max-w-[10rem] truncate">{prev.term}</span></ButtonLink> : <span />}
          {next ? <ButtonLink to={`/dictionary/${next.id}`} variant="outline" size="sm" aria-label={`Next term: ${next.term}`}><span className="max-w-[10rem] truncate">{next.term}</span><ArrowRight className="h-4 w-4" aria-hidden /></ButtonLink> : <span />}
        </nav>
      </div>
    </div>
  );
}

/** "Test my understanding": the term's practice MCQ with shuffled choices and immediate feedback. */
function UnderstandingCheck({ term }: { term: GlossaryTerm }) {
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const shownAt = useRef(Date.now());
  const order = useMemo(() => shuffle([0, 1, 2, 3], rngFrom(`${term.id}:practice:${round}`)), [term.id, round]);
  const mcq = term.practice;

  const choose = (orig: number) => {
    if (picked !== null) return;
    setPicked(orig);
    const correct = orig === mcq.answerIndex;
    void recordAttempt({
      questionId: `term:${term.id}`,
      sectionId: term.sectionId,
      concepts: [term.id],
      difficulty: term.difficulty,
      correct,
      choiceId: String(orig),
      confidence: null,
      responseMs: Date.now() - shownAt.current,
      mode: 'glossary',
      sessionId: `glossary:${term.id}`,
      confusedWith: correct ? undefined : confusedTermFor(mcq.choices[orig], term.id),
    });
  };
  const reset = () => { setPicked(null); setRound((r) => r + 1); shownAt.current = Date.now(); };

  return (
    <Section title="Test my understanding" icon={<CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />}>
      <p id={`practice-${term.id}`} className="mb-3 font-medium leading-6">{mcq.prompt}</p>
      <div role="radiogroup" aria-labelledby={`practice-${term.id}`} className="space-y-2">
        {order.map((orig, pos) => {
          const isSel = picked === orig;
          const isRight = orig === mcq.answerIndex;
          const reveal = picked !== null;
          return (
            <button key={orig} type="button" role="radio" aria-checked={isSel} disabled={reveal} onClick={() => choose(orig)} data-testid="term-choice"
              className={cn('flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors',
                !reveal && 'border-border hover:border-primary/50 hover:bg-surface-2',
                reveal && isRight && 'border-success bg-success/10',
                reveal && isSel && !isRight && 'border-danger bg-danger/10',
                reveal && !isSel && !isRight && 'border-border opacity-70')}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold">{'ABCD'[pos]}</span>
              <span className="flex-1">{mcq.choices[orig]}</span>
              {reveal && isRight && <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="Correct answer" />}
              {reveal && isSel && !isRight && <XCircle className="h-5 w-5 shrink-0 text-danger" aria-label="Your answer (incorrect)" />}
            </button>
          );
        })}
      </div>
      <div aria-live="polite">
        {picked !== null && (
          <div className="mt-3 rounded-lg bg-surface-2 p-3 text-sm leading-6" data-testid="term-feedback">
            <div className={cn('mb-1 font-semibold', picked === mcq.answerIndex ? 'text-success' : 'text-danger')}>
              {picked === mcq.answerIndex ? 'Correct' : 'Not quite'}
            </div>
            {mcq.explanation}
            {picked !== mcq.answerIndex && <div className="mt-1 text-muted">This term was added to your flashcards for review.</div>}
          </div>
        )}
      </div>
      {picked !== null && <Button variant="outline" size="sm" className="mt-3" onClick={reset} data-testid="term-retry">Try again</Button>}
    </Section>
  );
}
