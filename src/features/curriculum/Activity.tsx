import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, RotateCcw, XCircle, PartyPopper } from 'lucide-react';
import type { Activity as ActivityT } from '@/content/schema';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { assignMatch, checkCategorize, checkMatch, checkSequence, checkTrueFalse, moveItem, shuffledPermutation, type CheckResult } from './activities';

type Of<T extends ActivityT['type']> = Extract<ActivityT, { type: T }>;

const MARK = ({ ok }: { ok: boolean }) =>
  ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="Correct" /> : <XCircle className="h-4 w-4 shrink-0 text-danger" aria-label="Incorrect" />;

/** Shared frame: prompt, body, Check/Reset buttons and the live result message. */
function Shell({ prompt, children, canCheck, onCheck, onReset, result, hint }: {
  prompt: string; children: ReactNode; canCheck: boolean; onCheck: () => void; onReset: () => void; result: CheckResult | null; hint: string;
}) {
  return (
    <div>
      <p className="mb-1 font-medium leading-6">{prompt}</p>
      <p className="mb-3 text-sm text-muted">{hint}</p>
      {children}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={onCheck} disabled={!canCheck} data-testid="activity-check">Check answers</Button>
        <Button variant="outline" onClick={onReset} data-testid="activity-reset"><RotateCcw className="h-4 w-4" aria-hidden />Reset</Button>
      </div>
      <div role="status" aria-live="polite" className="mt-3 min-h-[1.5rem]" data-testid="activity-result">
        {result && (result.allCorrect ? (
          <p className="flex items-center gap-2 rounded-lg bg-success/10 p-3 font-medium text-success"><PartyPopper className="h-5 w-5" aria-hidden />Perfect — all {result.total} correct!</p>
        ) : (
          <p className="rounded-lg bg-warning/10 p-3 text-sm"><span className="font-semibold">{result.correct} of {result.total} correct.</span> Fix the items marked incorrect, then check again.</p>
        ))}
      </div>
    </div>
  );
}

export function LessonActivity({ activity, lessonId, onSolved }: { activity: ActivityT; lessonId: string; onSolved?: () => void }) {
  const solved = useRef(false);
  const report = (r: CheckResult) => { if (r.allCorrect && !solved.current) { solved.current = true; onSolved?.(); } };
  switch (activity.type) {
    case 'match': return <MatchActivity a={activity} seed={`${lessonId}:match`} report={report} />;
    case 'categorize': return <CategorizeActivity a={activity} report={report} />;
    case 'sequence': return <SequenceActivity a={activity} seed={`${lessonId}:seq`} report={report} />;
    case 'truefalse': return <TrueFalseActivity a={activity} report={report} />;
  }
}

// ------------------------------------------------------------------ match
function MatchActivity({ a, seed, report }: { a: Of<'match'>; seed: string; report: (r: CheckResult) => void }) {
  const n = a.pairs.length;
  const [round, setRound] = useState(0);
  const rightOrder = useMemo(() => shuffledPermutation(n, `${seed}:${round}`), [n, seed, round]);
  const [assignment, setAssignment] = useState<(number | null)[]>(() => Array(n).fill(null));
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const touch = <T,>(fn: () => T) => { setResult(null); return fn(); };

  const clickLeft = (i: number) => touch(() => {
    if (assignment[i] !== null) { setAssignment((as) => as.map((v, k) => (k === i ? null : v))); setSelected(i); return; }
    setSelected((s) => (s === i ? null : i));
  });
  const clickRight = (pairIdx: number) => touch(() => {
    if (selected === null) return;
    setAssignment((as) => assignMatch(as, selected, pairIdx));
    setSelected(null);
  });
  const usedBy = (pairIdx: number) => assignment.findIndex((v) => v === pairIdx);

  return (
    <Shell
      prompt={a.prompt}
      hint="Select an item on the left, then select its match on the right. Select a matched item to undo it."
      canCheck={assignment.every((v) => v !== null)}
      onCheck={() => { const r = checkMatch(a.pairs, assignment); setResult(r); report(r); }}
      onReset={() => { setAssignment(Array(n).fill(null)); setSelected(null); setResult(null); setRound((r) => r + 1); }}
      result={result}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ul className="space-y-2" aria-label="Items to match">
          {a.pairs.map((p, i) => {
            const as = assignment[i];
            const ok = result ? result.perItem[i] : null;
            return (
              <li key={i}>
                <button type="button" aria-pressed={selected === i} onClick={() => clickLeft(i)} data-testid="match-left"
                  className={cn('flex w-full items-start gap-2 rounded-lg border p-3 text-left text-sm transition-colors',
                    selected === i ? 'border-primary bg-primary/10 ring-2 ring-primary/40' : 'border-border bg-surface hover:bg-surface-2',
                    ok === true && 'border-success bg-success/10', ok === false && 'border-danger bg-danger/10')}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold">{i + 1}</span>
                  <span className="flex-1">
                    {p.left}
                    {as !== null && <span className="mt-1 block text-muted">→ {a.pairs[as].right}</span>}
                  </span>
                  {ok !== null && <MARK ok={ok} />}
                </button>
              </li>
            );
          })}
        </ul>
        <ul className="space-y-2" aria-label="Choices">
          {rightOrder.map((pairIdx) => {
            const by = usedBy(pairIdx);
            return (
              <li key={pairIdx}>
                <button type="button" onClick={() => clickRight(pairIdx)} disabled={selected === null} data-testid="match-right"
                  className={cn('flex w-full items-start gap-2 rounded-lg border border-border bg-surface p-3 text-left text-sm transition-colors enabled:hover:bg-surface-2 disabled:cursor-default', by >= 0 && 'opacity-70')}>
                  <span className="flex-1">{a.pairs[pairIdx].right}</span>
                  {by >= 0 && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold">matched to {by + 1}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Shell>
  );
}

// ------------------------------------------------------------------ categorize
function CategorizeActivity({ a, report }: { a: Of<'categorize'>; report: (r: CheckResult) => void }) {
  const [assignment, setAssignment] = useState<(string | null)[]>(() => Array(a.items.length).fill(null));
  const [result, setResult] = useState<CheckResult | null>(null);
  const set = (i: number, cat: string) => { setResult(null); setAssignment((as) => as.map((v, k) => (k === i ? cat : v))); };
  return (
    <Shell
      prompt={a.prompt}
      hint="Choose a category for every item, then check."
      canCheck={assignment.every((v) => v !== null)}
      onCheck={() => { const r = checkCategorize(a.items, assignment); setResult(r); report(r); }}
      onReset={() => { setAssignment(Array(a.items.length).fill(null)); setResult(null); }}
      result={result}
    >
      <ul className="space-y-3">
        {a.items.map((it, i) => {
          const ok = result ? result.perItem[i] : null;
          return (
            <li key={i} className={cn('rounded-lg border p-3', ok === true ? 'border-success bg-success/10' : ok === false ? 'border-danger bg-danger/10' : 'border-border bg-surface')}>
              <div className="flex items-start gap-2 text-sm"><span className="flex-1 font-medium" id={`cat-${i}`}>{it.text}</span>{ok !== null && <MARK ok={ok} />}</div>
              <div role="radiogroup" aria-labelledby={`cat-${i}`} className="mt-2 flex flex-wrap gap-2">
                {a.categories.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={assignment[i] === c} onClick={() => set(i, c)} data-testid="category-option"
                    className={cn('rounded-full border px-3 py-1 text-sm transition-colors', assignment[i] === c ? 'border-primary bg-primary text-primary-fg' : 'border-border hover:bg-surface-2')}>
                    {c}
                  </button>
                ))}
              </div>
              {ok === false && <p className="mt-2 text-xs text-muted">Hint: this one isn’t “{assignment[i]}”.</p>}
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}

// ------------------------------------------------------------------ sequence
function SequenceActivity({ a, seed, report }: { a: Of<'sequence'>; seed: string; report: (r: CheckResult) => void }) {
  const n = a.steps.length;
  const [round, setRound] = useState(0);
  const [order, setOrder] = useState<number[]>(() => shuffledPermutation(n, `${seed}:0`));
  const [result, setResult] = useState<CheckResult | null>(null);
  const [announce, setAnnounce] = useState('');
  const focusRef = useRef<{ pos: number; dir: 'up' | 'down' } | null>(null);
  const btns = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    const f = focusRef.current;
    if (f) { btns.current[`${f.pos}-${f.dir}`]?.focus(); focusRef.current = null; }
  }, [order]);

  const move = (pos: number, to: number) => {
    if (to < 0 || to >= n) return;
    setResult(null);
    setOrder((o) => moveItem(o, pos, to));
    setAnnounce(`${a.steps[order[pos]]} moved to position ${to + 1} of ${n}`);
    focusRef.current = { pos: to, dir: to > pos ? 'down' : 'up' };
  };
  return (
    <Shell
      prompt={a.prompt}
      hint="Use the up and down buttons to put the steps in the correct order, then check."
      canCheck
      onCheck={() => { const r = checkSequence(order); setResult(r); report(r); }}
      onReset={() => { setRound((r) => r + 1); setOrder(shuffledPermutation(n, `${seed}:${round + 1}`)); setResult(null); setAnnounce(''); }}
      result={result}
    >
      <ol className="space-y-2" aria-label="Steps">
        {order.map((stepIdx, pos) => {
          const ok = result ? result.perItem[pos] : null;
          return (
            <li key={stepIdx} className={cn('flex items-center gap-2 rounded-lg border p-2 text-sm', ok === true ? 'border-success bg-success/10' : ok === false ? 'border-danger bg-danger/10' : 'border-border bg-surface')} data-testid="sequence-item">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold">{pos + 1}</span>
              <span className="flex-1 leading-5">{a.steps[stepIdx]}</span>
              {ok !== null && <MARK ok={ok} />}
              <button type="button" ref={(el) => { btns.current[`${pos}-up`] = el; }} className="flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-surface-2 disabled:opacity-40" disabled={pos === 0} onClick={() => move(pos, pos - 1)} aria-label={`Move up: ${a.steps[stepIdx]}`} data-testid="seq-up"><ArrowUp className="h-4 w-4" aria-hidden /></button>
              <button type="button" ref={(el) => { btns.current[`${pos}-down`] = el; }} className="flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-surface-2 disabled:opacity-40" disabled={pos === n - 1} onClick={() => move(pos, pos + 1)} aria-label={`Move down: ${a.steps[stepIdx]}`} data-testid="seq-down"><ArrowDown className="h-4 w-4" aria-hidden /></button>
            </li>
          );
        })}
      </ol>
      <div className="sr-only" aria-live="polite">{announce}</div>
    </Shell>
  );
}

// ------------------------------------------------------------------ true / false
function TrueFalseActivity({ a, report }: { a: Of<'truefalse'>; report: (r: CheckResult) => void }) {
  const [answers, setAnswers] = useState<(boolean | null)[]>(() => Array(a.statements.length).fill(null));
  const [result, setResult] = useState<CheckResult | null>(null);
  const set = (i: number, v: boolean) => { setResult(null); setAnswers((as) => as.map((x, k) => (k === i ? v : x))); };
  return (
    <Shell
      prompt={a.prompt}
      hint="Decide whether each statement is true or false, then check."
      canCheck={answers.every((v) => v !== null)}
      onCheck={() => { const r = checkTrueFalse(a.statements, answers); setResult(r); report(r); }}
      onReset={() => { setAnswers(Array(a.statements.length).fill(null)); setResult(null); }}
      result={result}
    >
      <ul className="space-y-3">
        {a.statements.map((s, i) => {
          const ok = result ? result.perItem[i] : null;
          return (
            <li key={i} className={cn('rounded-lg border p-3', ok === true ? 'border-success bg-success/10' : ok === false ? 'border-danger bg-danger/10' : 'border-border bg-surface')}>
              <div className="flex items-start gap-2 text-sm"><span className="flex-1" id={`tf-${i}`}>{s.text}</span>{ok !== null && <MARK ok={ok} />}</div>
              <div role="radiogroup" aria-labelledby={`tf-${i}`} className="mt-2 flex gap-2">
                {[true, false].map((v) => (
                  <button key={String(v)} type="button" role="radio" aria-checked={answers[i] === v} onClick={() => set(i, v)} data-testid={v ? 'tf-true' : 'tf-false'}
                    className={cn('min-w-[4.5rem] rounded-full border px-4 py-1 text-sm transition-colors', answers[i] === v ? 'border-primary bg-primary text-primary-fg' : 'border-border hover:bg-surface-2')}>
                    {v ? 'True' : 'False'}
                  </button>
                ))}
              </div>
              {ok !== null && <p className="mt-2 text-sm text-muted"><span className="font-semibold text-fg">{s.answer ? 'True' : 'False'}. </span>{s.explanation}</p>}
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}
