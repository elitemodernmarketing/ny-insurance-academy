import { useRef, useState } from 'react';
import { CheckCircle2, XCircle, ChevronRight, RotateCcw } from 'lucide-react';
import { content } from '@/content';
import type { ComplianceCase } from '@/content/schema';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { TermLink } from '@/components/ui/Markdown';
import { SourceList, VerificationBadge } from '@/components/ui/Verification';
import { cn } from '@/components/ui/cn';
import { recordAttempt, newId } from '@/db/repo';
import { PendingContent } from './ScenarioFrame';
import { markScenarioComplete, sectionFromOutline } from './progress';

export const ISSUE_LABEL: Record<ComplianceCase['issue'], string> = {
  misrepresentation: 'Misrepresentation', rebating: 'Rebating', replacement: 'Replacement', advertising: 'Advertising',
  'unfair-discrimination': 'Unfair discrimination', twisting: 'Twisting', fiduciary: 'Fiduciary duty', licensing: 'Licensing',
  privacy: 'Privacy', fraud: 'Fraud', none: 'No violation',
};

export default function ComplianceScenario() {
  const cases = content.complianceCases;
  const [run, setRun] = useState(0); // bump to restart
  if (!cases.length) return <PendingContent what="compliance cases" />;
  return <Run key={run} cases={cases} onRestart={() => setRun((r) => r + 1)} />;
}

function Run({ cases, onRestart }: { cases: ComplianceCase[]; onRestart: () => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const sessionId = useRef(newId('compliance'));
  const shownAt = useRef(Date.now());
  const finished = i >= cases.length;
  const total = cases.length;
  const correctCount = cases.filter((c) => picked[c.id] === c.correct).length;

  if (finished) {
    return (
      <Card>
        <CardHeader title="Cases complete" description={`You answered ${correctCount} of ${total} correctly.`} />
        <CardBody className="space-y-3">
          <p className="text-3xl font-bold tabular-nums" aria-live="polite">{Math.round((correctCount / total) * 100)}%</p>
          <ul className="space-y-1 text-sm">
            {cases.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                {picked[c.id] === c.correct ? <CheckCircle2 className="h-4 w-4 text-success" aria-label="Correct" /> : <XCircle className="h-4 w-4 text-danger" aria-label="Incorrect" />}
                <span>{c.title}</span><Badge>{ISSUE_LABEL[c.issue]}</Badge>
              </li>
            ))}
          </ul>
          <Button onClick={onRestart}><RotateCcw className="h-4 w-4" aria-hidden />Run the cases again</Button>
        </CardBody>
      </Card>
    );
  }

  const c = cases[i];
  const sel = picked[c.id];
  const choose = (id: string) => {
    if (sel) return;
    setPicked((p) => ({ ...p, [c.id]: id }));
    const ok = id === c.correct;
    void markScenarioComplete(`compliance:${c.id}`, 'compliance', ok ? 100 : 0);
    const concepts = c.concepts.filter((x) => content.termById.has(x));
    if (concepts.length) {
      void recordAttempt({
        questionId: `scenario:compliance:${c.id}`, sectionId: sectionFromOutline(c.outlineIds), concepts, difficulty: 2, correct: ok,
        choiceId: id, confidence: null, responseMs: Date.now() - shownAt.current, mode: 'scenario', sessionId: sessionId.current,
      });
    }
  };
  const next = () => { shownAt.current = Date.now(); setI(i + 1); };

  return (
    <Card key={c.id}>
      <CardHeader title={`Case ${i + 1} of ${total}: ${c.title}`} action={<VerificationBadge v={c.verification} nySpecific={c.nySpecific} />} />
      <CardBody className="space-y-4">
        <Progress value={i} max={total} label="Cases completed" />
        <div className="rounded-lg bg-surface-2 p-3 text-sm leading-6" data-testid="compliance-narrative">{c.narrative}</div>
        <fieldset>
          <legend className="mb-2 font-semibold">{c.question}</legend>
          <div className="space-y-2">
            {c.options.map((o, idx) => {
              const isCorrect = o.id === c.correct;
              const isPicked = sel === o.id;
              return (
                <div key={o.id}>
                  <button type="button" disabled={!!sel} aria-pressed={isPicked} onClick={() => choose(o.id)} data-testid="compliance-option"
                    className={cn('flex w-full items-start gap-2 rounded-lg border p-3 text-left text-sm transition-colors',
                      !sel ? 'border-border bg-surface hover:bg-surface-2' : isCorrect ? 'border-success bg-success/10' : isPicked ? 'border-danger bg-danger/10' : 'border-border opacity-80')}>
                    <span className="font-semibold">{String.fromCharCode(65 + idx)}.</span><span className="flex-1">{o.text}</span>
                    {sel && isCorrect && <span className="inline-flex shrink-0 items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" aria-hidden />Correct answer</span>}
                    {sel && isPicked && !isCorrect && <span className="inline-flex shrink-0 items-center gap-1 text-danger"><XCircle className="h-4 w-4" aria-hidden />Your answer</span>}
                  </button>
                  {sel && <p className="ml-1 mt-1 border-l-2 border-border pl-3 text-sm text-muted"><strong className="text-fg">Why:</strong> {o.rationale}</p>}
                </div>
              );
            })}
          </div>
        </fieldset>
        <div aria-live="polite">
          {sel && (
            <div className="space-y-3 rounded-lg border border-border p-3 animate-fade-in" data-testid="compliance-feedback">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={sel === c.correct ? 'success' : 'danger'}>{sel === c.correct ? 'Correct' : 'Incorrect'}</Badge>
                <span className="text-sm text-muted">Issue type:</span><Badge tone="primary" data-testid="compliance-issue">{ISSUE_LABEL[c.issue]}</Badge>
              </div>
              <p className="text-sm leading-6">{c.explanation}</p>
              {c.concepts.length > 0 && <p className="flex flex-wrap gap-x-3 text-sm"><span className="text-muted">Concepts:</span>{c.concepts.map((x) => <TermLink key={x} id={x} />)}</p>}
              <SourceList ids={c.sources} />
              <Button onClick={next} data-testid="compliance-next">{i + 1 >= total ? 'See results' : 'Next case'}<ChevronRight className="h-4 w-4" aria-hidden /></Button>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
