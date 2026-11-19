import { useRef, useState } from 'react';
import { CheckCircle2, Clock, XCircle, RotateCcw, CircleDashed, ChevronLeft, ChevronRight } from 'lucide-react';
import { content } from '@/content';
import type { PolicyTimeline } from '@/content/schema';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TermLink } from '@/components/ui/Markdown';
import { SourceList, VerificationBadge } from '@/components/ui/Verification';
import { cn } from '@/components/ui/cn';
import { recordAttempt, newId } from '@/db/repo';
import { PendingContent } from './ScenarioFrame';
import { markScenarioComplete, sectionFromOutline, useScenarioProgress } from './progress';

type Status = PolicyTimeline['steps'][number]['status'];
export const STATUS: Record<Status, { label: string; tone: BadgeTone; Icon: typeof Clock; dot: string }> = {
  'in-force': { label: 'In force', tone: 'success', Icon: CheckCircle2, dot: 'bg-success' },
  grace: { label: 'Grace period', tone: 'warning', Icon: Clock, dot: 'bg-warning' },
  lapsed: { label: 'Lapsed', tone: 'danger', Icon: XCircle, dot: 'bg-danger' },
  reinstated: { label: 'Reinstated', tone: 'info', Icon: RotateCcw, dot: 'bg-info' },
  pending: { label: 'Pending', tone: 'neutral', Icon: CircleDashed, dot: 'bg-muted' },
};

export default function PolicyTimelineScenario() {
  const items = content.policyTimelines;
  const progress = useScenarioProgress();
  const [id, setId] = useState<string | null>(items.length === 1 ? items[0].id : null);
  if (!items.length) return <PendingContent what="policy timelines" />;
  const t = items.find((x) => x.id === id);
  if (!t) {
    return (
      <section aria-labelledby="pick-tl">
        <h2 id="pick-tl" className="mb-3 text-lg font-semibold">Choose a timeline</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((x) => {
            const done = progress.get(`policy-timeline:${x.id}`);
            return (
              <li key={x.id}><button type="button" onClick={() => setId(x.id)} className="flex h-full w-full flex-col rounded-xl border border-border bg-surface p-4 text-left shadow-sm hover:bg-surface-2">
                <span className="flex items-center justify-between gap-2"><span className="font-semibold">{x.title}</span>{done && <Badge tone="success"><CheckCircle2 className="h-3 w-3" aria-hidden />Completed</Badge>}</span>
                <span className="mt-1 text-sm text-muted">{x.intro}</span></button></li>
            );
          })}
        </ul>
      </section>
    );
  }
  return <TimelineRun key={t.id} t={t} onExit={items.length > 1 ? () => setId(null) : undefined} />;
}

function TimelineRun({ t, onExit }: { t: PolicyTimeline; onExit?: () => void }) {
  const [i, setI] = useState(0);
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]));
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const saved = useRef(false);
  const sessionId = useRef(newId('timeline'));
  const startedAt = useRef(Date.now());
  const step = t.steps[i];
  const st = STATUS[step.status];
  const q = step.question;
  const answered = answers[step.id];
  const questionSteps = t.steps.filter((s) => s.question);

  const maybeComplete = (nextVisited: Set<number>, nextAnswers: Record<string, number>) => {
    if (saved.current) return;
    if (nextVisited.size === t.steps.length && questionSteps.every((s) => nextAnswers[s.id] !== undefined)) {
      saved.current = true;
      const correct = questionSteps.filter((s) => nextAnswers[s.id] === s.question!.answerIndex).length;
      void markScenarioComplete(`policy-timeline:${t.id}`, 'policy-timeline', questionSteps.length ? Math.round((correct / questionSteps.length) * 100) : null);
    }
  };
  const go = (n: number) => {
    const idx = Math.max(0, Math.min(t.steps.length - 1, n));
    const v = new Set(visited); v.add(idx);
    setI(idx); setVisited(v); maybeComplete(v, answers);
  };
  const choose = (ci: number) => {
    if (!q || answered !== undefined) return;
    const next = { ...answers, [step.id]: ci };
    setAnswers(next);
    const concepts = t.concepts.filter((c) => content.termById.has(c));
    if (concepts.length) {
      void recordAttempt({
        questionId: `scenario:timeline:${t.id}:${step.id}`, sectionId: sectionFromOutline(t.outlineIds), concepts, difficulty: 2,
        correct: ci === q.answerIndex, choiceId: String.fromCharCode(97 + ci), confidence: null,
        responseMs: Date.now() - startedAt.current, mode: 'scenario', sessionId: sessionId.current,
      });
    }
    maybeComplete(visited, next);
  };
  const correctCount = questionSteps.filter((s) => answers[s.id] === s.question!.answerIndex).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t.title} description={t.intro} action={onExit ? <Button variant="ghost" size="sm" onClick={onExit}>Change timeline</Button> : undefined} />
        <CardBody>
          <div className="flex flex-wrap items-center gap-2"><VerificationBadge v={t.verification} nySpecific={t.nySpecific} />
            {t.concepts.length > 0 && <span className="flex flex-wrap gap-x-3 text-sm"><span className="text-muted">Concepts:</span>{t.concepts.map((c) => <TermLink key={c} id={c} />)}</span>}</div>
          <ol className="mt-4 space-y-1" aria-label="Policy timeline steps">
            {t.steps.map((s, idx) => {
              const S = STATUS[s.status];
              const active = idx === i;
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => go(idx)} aria-current={active ? 'step' : undefined} data-testid="timeline-step"
                    className={cn('flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors', active ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-surface-2')}>
                    <span className={cn('h-3 w-3 shrink-0 rounded-full', S.dot, !visited.has(idx) && 'opacity-40')} aria-hidden />
                    <span className="w-16 shrink-0 tabular-nums text-muted">Day {s.day}</span>
                    <span className="min-w-0 flex-1 font-medium">{s.label}</span>
                    <span className="hidden items-center gap-1 text-xs text-muted sm:inline-flex"><S.Icon className="h-3.5 w-3.5" aria-hidden />{S.label}</span>
                    <span className="sr-only">Status: {S.label}.{s.question ? (answers[s.id] !== undefined ? ' Question answered.' : ' Has a question.') : ''}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </CardBody>
      </Card>

      <Card>
        <CardHeader as="h3" title={`Step ${i + 1} of ${t.steps.length}: ${step.label}`} description={`Day ${step.day}`}
          action={<Badge tone={st.tone}><st.Icon className="h-3 w-3" aria-hidden />Status: {st.label}</Badge>} />
        <CardBody className="space-y-4">
          <p className="text-sm leading-6">{step.detail}</p>
          {q && (
            <fieldset className="rounded-lg border border-border p-3" data-testid="timeline-question">
              <legend className="px-1 text-sm font-semibold">Check your understanding</legend>
              <p className="mb-2 text-sm">{q.prompt}</p>
              <div className="space-y-2">
                {q.choices.map((c, ci) => {
                  const isCorrect = ci === q.answerIndex;
                  const picked = answered === ci;
                  return (
                    <button key={ci} type="button" disabled={answered !== undefined} onClick={() => choose(ci)} aria-pressed={picked} data-testid="timeline-choice"
                      className={cn('flex w-full items-start gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors',
                        answered === undefined ? 'border-border bg-surface hover:bg-surface-2' : isCorrect ? 'border-success bg-success/10' : picked ? 'border-danger bg-danger/10' : 'border-border opacity-70')}>
                      <span className="font-semibold">{String.fromCharCode(65 + ci)}.</span><span className="flex-1">{c}</span>
                      {answered !== undefined && isCorrect && <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" aria-hidden />Correct</span>}
                      {answered !== undefined && picked && !isCorrect && <span className="inline-flex items-center gap-1 text-danger"><XCircle className="h-4 w-4" aria-hidden />Your answer</span>}
                    </button>
                  );
                })}
              </div>
              <div aria-live="polite">{answered !== undefined && <p className="mt-2 rounded-md bg-surface-2 p-2 text-sm"><strong>{answered === q.answerIndex ? 'Correct. ' : 'Not quite. '}</strong>{q.explanation}</p>}</div>
            </fieldset>
          )}
          <SourceList ids={step.sources} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" onClick={() => go(i - 1)} disabled={i === 0}><ChevronLeft className="h-4 w-4" aria-hidden />Previous</Button>
            <span className="text-xs text-muted">{visited.size} of {t.steps.length} steps visited{questionSteps.length ? ` · ${correctCount}/${questionSteps.length} questions correct` : ''}</span>
            <Button onClick={() => go(i + 1)} disabled={i === t.steps.length - 1} data-testid="timeline-next">Next<ChevronRight className="h-4 w-4" aria-hidden /></Button>
          </div>
          {saved.current && <p role="status" className="rounded-lg bg-success/10 p-3 text-sm text-success">Timeline complete.</p>}
        </CardBody>
      </Card>
    </div>
  );
}
