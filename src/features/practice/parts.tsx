/** Small presentational pieces shared by practice, exam results and review. */
import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, AlertTriangle, CheckCircle2, CircleDashed } from 'lucide-react';
import type { Question } from '@/content/schema';
import { QuestionView, ExplanationPanel, LETTERS } from '@/components/question/QuestionView';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/components/ui/cn';
import { plainText } from '@/components/ui/Markdown';
import type { RubricResult } from '@/lib/rubric';
import { gradeForQuestion } from './practiceService';

/** Disclosure button + lazily rendered panel (content is mounted only while open). */
export function Expandable({ header, children, defaultOpen = false, className, testId }: { header: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string; testId?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <div className={cn('rounded-xl border border-border bg-surface', className)} data-testid={testId}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={panelId}
        className="flex w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-surface-2 sm:p-4">
        <span className="min-w-0 flex-1">{header}</span>
        <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <div id={panelId} hidden={!open} className="border-t border-border p-3 sm:p-4">{open ? children : null}</div>
    </div>
  );
}

export function snippet(q: Question, max = 110): string {
  const t = plainText(q.stem);
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** A revealed question with the learner's choice and the full explanation. */
export function ReviewBody({ question: q, order, selected, extra }: { question: Question; order: string[]; selected: string | null; extra?: ReactNode }) {
  return (
    <div>
      {extra}
      <QuestionView question={q} order={order} selected={selected} reveal disabled />
      <ExplanationPanel question={q} order={order} selected={selected} />
    </div>
  );
}

/** Matched / missing key points from the explanation rubric. */
export function RubricFeedback({ result, hasText }: { result: RubricResult | null; hasText: boolean }) {
  if (!hasText || !result) {
    return (
      <div className="mt-5 rounded-xl border border-border bg-surface p-4 text-sm text-muted" data-testid="rubric-feedback">
        You did not write an explanation, so there is nothing to check. Try explaining in your own words next time: it is the best way to find gaps.
      </div>
    );
  }
  const total = result.matched.length + result.missing.length;
  return (
    <section className="mt-5 rounded-xl border border-border bg-surface p-4" aria-live="polite" data-testid="rubric-feedback">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Your explanation</h3>
        <Badge tone={result.score >= 0.7 ? 'success' : result.score >= 0.4 ? 'warning' : 'danger'}>{result.matched.length} of {total} key points ({Math.round(result.score * 100)}%)</Badge>
      </div>
      <p className="mb-3 text-xs text-muted">Checked by keyword matching against the key ideas for this question. A missing point may just be worded differently.</p>
      <ul className="space-y-1.5 text-sm">
        {result.matched.map((m) => (
          <li key={m} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /><span><span className="sr-only">Covered: </span>{m}</span></li>
        ))}
        {result.missing.map((m) => (
          <li key={m} className="flex items-start gap-2"><CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden /><span><span className="sr-only">Missing: </span>{m}</span></li>
        ))}
      </ul>
    </section>
  );
}

export function RubricForAnswer({ question, text }: { question: Question; text?: string }) {
  const t = text?.trim() ?? '';
  return <RubricFeedback hasText={!!t} result={t ? gradeForQuestion(question, t) : null} />;
}

const TAG_WARNINGS: Record<string, string> = {
  'negative-wording': 'Negative wording: the question asks which choice is NOT true (EXCEPT / NOT / LEAST). Re-read the stem before choosing.',
  'ny-law': 'New York rules can differ from general industry practice. Watch for a general-principle choice that is not the NY answer.',
  math: 'Calculation item: do the arithmetic yourself rather than trusting the closest-looking number.',
  tricky: 'Flagged as a tricky item: the wrong choices are close to the right one.',
};

/** Tricky Questions feedback: the trap, and why each tempting wrong choice fails. */
export function TrapAnalysis({ question: q, order, selected }: { question: Question; order: string[]; selected: string | null }) {
  const warnings = [...q.tags.filter((t) => TAG_WARNINGS[t]).map((t) => TAG_WARNINGS[t])];
  if (q.style === 'negative' && !q.tags.includes('negative-wording')) warnings.push(TAG_WARNINGS['negative-wording']);
  const wrong = order.map((cid, i) => ({ c: q.choices.find((x) => x.id === cid)!, letter: LETTERS[i] })).filter((x) => x.c.id !== q.correct);
  return (
    <section className="mt-5 rounded-xl border border-warning/40 bg-warning/5 p-4" data-testid="trap-analysis" aria-label="The trap in this question">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-warning" aria-hidden />Where the trap is</h3>
      {warnings.length > 0 && <ul className="mb-3 list-disc space-y-1 pl-5 text-sm">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      <p className="mb-2 text-sm text-muted">Why each tempting wrong answer fails:</p>
      <ul className="space-y-2">
        {wrong.map(({ c, letter }) => (
          <li key={c.id} className={cn('rounded-lg p-2 text-sm', c.id === selected ? 'bg-danger/10 ring-1 ring-danger/40' : 'bg-surface')}>
            <span className="font-semibold">{letter}. {c.text}{c.id === selected && <span className="ml-2 text-danger">(your answer)</span>}</span>
            <span className="block text-muted">{c.rationale}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
