import { useId, useMemo } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { InlineMcq as McqT } from '@/content/schema';
import { rngFrom, shuffle } from '@/lib/rng';
import { cn } from '@/components/ui/cn';
import { Button } from '@/components/ui/Button';

/** Inline multiple-choice with immediate feedback. `selected` is the ORIGINAL choice index (display order is shuffled). */
export function InlineMcq({ mcq, seed, selected, onSelect, onRetry, number }: {
  mcq: McqT; seed: string; selected: number | null; onSelect: (originalIndex: number) => void; onRetry?: () => void; number?: number;
}) {
  const id = useId();
  const order = useMemo(() => shuffle([0, 1, 2, 3], rngFrom(seed)), [seed]);
  const reveal = selected !== null;
  const right = selected === mcq.answerIndex;
  return (
    <div>
      <p id={`${id}-q`} className="mb-3 font-medium leading-6">{number !== undefined && <span className="mr-1 text-muted">{number}.</span>}{mcq.prompt}</p>
      <div role="radiogroup" aria-labelledby={`${id}-q`} className="space-y-2">
        {order.map((orig, pos) => {
          const isSel = selected === orig;
          const isRight = orig === mcq.answerIndex;
          return (
            <button key={orig} type="button" role="radio" aria-checked={isSel} disabled={reveal} onClick={() => onSelect(orig)} data-testid="kc-choice"
              className={cn('flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors',
                !reveal && 'border-border bg-surface hover:border-primary/50 hover:bg-surface-2',
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
        {reveal && (
          <div className="mt-3 rounded-lg bg-surface-2 p-3 text-sm leading-6" data-testid="kc-feedback">
            <div className={cn('mb-1 font-semibold', right ? 'text-success' : 'text-danger')}>{right ? 'Correct' : 'Not quite'}</div>
            {mcq.explanation}
          </div>
        )}
      </div>
      {reveal && onRetry && <Button variant="ghost" size="sm" className="mt-2" onClick={onRetry}>Try again</Button>}
    </div>
  );
}
