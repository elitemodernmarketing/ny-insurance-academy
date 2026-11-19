/**
 * Shared multiple-choice question UI used by practice, exams, lesson quizzes, review and the diagnostic.
 * Choices are displayed in `order` (shuffled ids) and labelled A–D by display position.
 * Keyboard: 1–4 or A–D select a choice (when `keyboard` is true).
 */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle, BookOpen, Lightbulb, Flag } from 'lucide-react';
import type { Question, ChoiceId } from '@/content/schema';
import { content, lessonForQuestion } from '@/content';
import { cn } from '@/components/ui/cn';
import { Badge } from '@/components/ui/Badge';
import { Markdown, TermLink } from '@/components/ui/Markdown';
import { SpeakButton } from '@/components/ui/Speak';
import { SourceList, VerificationBadge } from '@/components/ui/Verification';
import type { Confidence } from '@/db/db';

export const LETTERS = ['A', 'B', 'C', 'D'];

export interface QuestionViewProps {
  question: Question;
  order: string[];
  selected: string | null;
  onSelect?: (choiceId: ChoiceId) => void;
  /** Show correct/incorrect marking on choices. */
  reveal?: boolean;
  disabled?: boolean;
  keyboard?: boolean;
  number?: number;
  total?: number;
  flagged?: boolean;
  onToggleFlag?: () => void;
  showMeta?: boolean;
}

export function QuestionView({ question: q, order, selected, onSelect, reveal, disabled, keyboard, number, total, flagged, onToggleFlag, showMeta = true }: QuestionViewProps) {
  useEffect(() => {
    if (!keyboard || disabled || !onSelect) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const idx = ['1', '2', '3', '4'].indexOf(k) >= 0 ? ['1', '2', '3', '4'].indexOf(k) : ['a', 'b', 'c', 'd'].indexOf(k);
      if (idx >= 0 && order[idx]) { e.preventDefault(); onSelect(order[idx] as ChoiceId); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard, disabled, onSelect, order]);

  const section = content.sectionById.get(q.sectionId);
  const speakText = `${q.scenario ? q.scenario + ' ' : ''}${q.stem} ${order.map((id, i) => `${LETTERS[i]}. ${q.choices.find((c) => c.id === id)?.text}`).join('. ')}`;

  return (
    <div className="animate-fade-in">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
        {number !== undefined && <span className="font-semibold text-fg">Question {number}{total ? ` of ${total}` : ''}</span>}
        {showMeta && section && <Badge>{section.shortName}</Badge>}
        {showMeta && <Badge tone={q.difficulty === 3 ? 'warning' : q.difficulty === 2 ? 'info' : 'neutral'}>{['', 'Foundational', 'Intermediate', 'Advanced'][q.difficulty]}</Badge>}
        {showMeta && q.nySpecific && <Badge tone="primary">NY law</Badge>}
        <span className="ml-auto flex items-center gap-1">
          <SpeakButton text={speakText} label="Read question aloud" />
          {onToggleFlag && (
            <button type="button" onClick={onToggleFlag} aria-pressed={!!flagged} className={cn('inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm', flagged ? 'bg-warning/15 text-warning' : 'text-muted hover:bg-surface-2')}>
              <Flag className="h-4 w-4" aria-hidden />{flagged ? 'Flagged' : 'Flag'}
            </button>
          )}
        </span>
      </div>
      {q.scenario && <p className="mb-3 rounded-lg bg-surface-2 p-3 leading-7">{q.scenario}</p>}
      <h2 className="mb-4 text-lg font-semibold leading-7" id={`q-${q.id}-stem`}>{q.stem}</h2>
      <div role="radiogroup" aria-labelledby={`q-${q.id}-stem`} className="space-y-2">
        {order.map((cid, i) => {
          const c = q.choices.find((x) => x.id === cid)!;
          const isSel = selected === cid;
          const isCorrect = cid === q.correct;
          return (
            <button
              key={cid}
              type="button"
              role="radio"
              aria-checked={isSel}
              disabled={disabled}
              onClick={() => onSelect?.(cid as ChoiceId)}
              data-choice={cid}
              data-testid={`choice-${i}`}
              className={cn(
                'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                !reveal && isSel && 'border-primary bg-primary/10 ring-2 ring-primary/40',
                !reveal && !isSel && 'border-border bg-surface hover:border-primary/50 hover:bg-surface-2',
                reveal && isCorrect && 'border-success bg-success/10',
                reveal && isSel && !isCorrect && 'border-danger bg-danger/10',
                reveal && !isSel && !isCorrect && 'border-border bg-surface opacity-80',
                disabled && !reveal && 'cursor-not-allowed opacity-70',
              )}
            >
              <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
                isSel ? 'border-primary bg-primary text-primary-fg' : 'border-border text-muted',
                reveal && isCorrect && 'border-success bg-success text-white',
                reveal && isSel && !isCorrect && 'border-danger bg-danger text-white')}>
                {LETTERS[i]}
              </span>
              <span className="flex-1 leading-6">{c.text}</span>
              {reveal && isCorrect && <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="Correct answer" />}
              {reveal && isSel && !isCorrect && <XCircle className="h-5 w-5 shrink-0 text-danger" aria-label="Your answer (incorrect)" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Full feedback: correct answer, why, why each distractor is wrong, concept, glossary + lesson links, memory tip. */
export function ExplanationPanel({ question: q, order, selected }: { question: Question; order: string[]; selected: string | null }) {
  const correctIdx = order.indexOf(q.correct);
  const isRight = selected === q.correct;
  const lesson = lessonForQuestion(q);
  return (
    <section aria-live="polite" className="mt-5 space-y-4 rounded-xl border border-border bg-surface p-4 animate-fade-in" data-testid="explanation">
      <div>
        <div className={cn('flex items-center gap-2 text-lg font-semibold', isRight ? 'text-success' : 'text-danger')}>
          {isRight ? <CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden /> : <XCircle className="h-6 w-6 shrink-0" aria-hidden />}
          {selected === null ? 'Not answered' : isRight ? 'Correct' : 'Incorrect'}
        </div>
        <p className="mt-1 text-base">The answer is <strong>{LETTERS[correctIdx]}: {q.choices.find((c) => c.id === q.correct)?.text}</strong></p>
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">Why</h3>
        <Markdown text={q.explanation} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Each choice</h3>
        <ul className="space-y-2">
          {order.map((cid, i) => {
            const c = q.choices.find((x) => x.id === cid)!;
            return (
              <li key={cid} className={cn('rounded-lg p-2 text-sm', cid === q.correct ? 'bg-success/10' : cid === selected ? 'bg-danger/10' : 'bg-surface-2')}>
                <span className="font-semibold">{LETTERS[i]}. {c.text}</span>
                <span className="block text-muted">{c.rationale}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex items-start gap-2 rounded-lg bg-accent/10 p-3 text-sm">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <span><span className="font-semibold">Memory tip: </span>{q.memoryTip}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="text-muted">Concepts tested:</span>
        {q.concepts.map((c) => <TermLink key={c} id={c} />)}
        {lesson && (
          <Link to={`/lesson/${lesson.id}`} className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline">
            <BookOpen className="h-4 w-4" aria-hidden />Lesson: {lesson.title}
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <SourceList ids={q.sources} />
        <VerificationBadge v={q.verification} nySpecific={q.nySpecific} />
      </div>
    </section>
  );
}

/** "How sure were you?" — feeds the adaptive engine (guessed-correct answers are re-scheduled). */
export function ConfidencePicker({ value, onChange, disabled }: { value: Confidence | null; onChange: (c: Confidence) => void; disabled?: boolean }) {
  const opts: { v: Confidence; label: string }[] = [{ v: 'guess', label: 'Guessing' }, { v: 'unsure', label: 'Unsure' }, { v: 'sure', label: 'Sure' }];
  return (
    <fieldset className="flex flex-wrap items-center gap-2 text-sm" disabled={disabled}>
      <legend className="sr-only">How confident are you?</legend>
      <span className="text-muted">Confidence:</span>
      {opts.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}
          className={cn('rounded-full border px-3 py-1', value === o.v ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted hover:bg-surface-2')}>
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}

/**
 * If the learner picked a distractor whose text names another glossary term, return that term id
 * (used to detect "confused pairs" like coinsurance vs copayment).
 */
export function detectConfusion(q: Question, choiceId: string): string | undefined {
  if (choiceId === q.correct) return undefined;
  const text = q.choices.find((c) => c.id === choiceId)?.text.toLowerCase().trim();
  if (!text) return undefined;
  for (const t of content.terms) {
    if (q.concepts.includes(t.id)) continue;
    const names = [t.term, ...t.aliases].map((n) => n.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim());
    if (names.some((n) => n.length > 3 && (text === n || text === `${n}s` || text.startsWith(`${n} `) || text.startsWith(`a ${n}`) || text.startsWith(`an ${n}`)))) return t.id;
  }
  return undefined;
}

export { content };
