import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle, ChevronRight, RotateCcw, Play } from 'lucide-react';
import { content } from '@/content';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { cn } from '@/components/ui/cn';
import { newSeed } from '@/lib/rng';
import { newId, recordAttempt } from '@/db/repo';
import { PendingContent } from './ScenarioFrame';
import { markScenarioComplete } from './progress';
import { buildRounds, type TermRound } from './terminology';

export const ROUNDS = 10;

export default function TerminologyChallenge() {
  const [seed, setSeed] = useState<number | null>(null);
  if (content.terms.length < 4) return <PendingContent what="glossary terms" />;
  if (seed === null) {
    return (
      <Card>
        <CardHeader title="Ready for ten rounds?" description="Each round shows a plain definition, or an example with the term blanked out. Pick the matching term from four choices." />
        <CardBody className="space-y-3">
          <p className="text-sm text-muted">Wrong answers are added to your flashcards and the look-alike term you picked is remembered so the app can show you a comparison.</p>
          <Button onClick={() => setSeed(newSeed())} data-testid="terminology-start"><Play className="h-4 w-4" aria-hidden />Start challenge</Button>
        </CardBody>
      </Card>
    );
  }
  return <Game key={seed} seed={seed} onRestart={() => setSeed(newSeed())} />;
}

function Game({ seed, onRestart }: { seed: number; onRestart: () => void }) {
  const rounds = useMemo(() => buildRounds(content.terms, seed, ROUNDS), [seed]);
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<Record<number, string>>({});
  const sessionId = useRef(newId('terms'));
  const shownAt = useRef(Date.now());
  const saved = useRef(false);

  if (!rounds.length) return <PendingContent what="glossary terms" />;
  const finished = i >= rounds.length;
  const score = rounds.filter((r, idx) => picks[idx] === r.answerId).length;

  if (finished) {
    const missed = rounds.filter((r, idx) => picks[idx] !== r.answerId);
    return (
      <Card>
        <CardHeader title="Challenge complete" description={`You matched ${score} of ${rounds.length} terms.`} />
        <CardBody className="space-y-4">
          <p className="text-3xl font-bold tabular-nums" aria-live="polite" data-testid="terminology-score">{Math.round((score / rounds.length) * 100)}%</p>
          {missed.length > 0 ? (
            <div>
              <h3 className="font-semibold">Terms to review</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {missed.map((r) => {
                  const idx = rounds.indexOf(r);
                  const chosen = r.choices.find((c) => c.id === picks[idx]);
                  const correct = r.choices.find((c) => c.id === r.answerId)!;
                  return <li key={r.termId}><Link className="font-medium text-primary hover:underline" to={`/dictionary/${r.termId}`}>{correct.term}</Link>{chosen && <span className="text-muted"> — you chose {chosen.term}</span>}</li>;
                })}
              </ul>
              <p className="mt-2 text-sm text-muted">These are now in your flashcard deck.</p>
            </div>
          ) : <p className="text-sm text-success">A perfect round. Every term matched.</p>}
          <Button onClick={onRestart} data-testid="terminology-restart"><RotateCcw className="h-4 w-4" aria-hidden />New challenge</Button>
        </CardBody>
      </Card>
    );
  }

  const r: TermRound = rounds[i];
  const sel = picks[i];
  const choose = (id: string) => {
    if (sel) return;
    const ok = id === r.answerId;
    const next = { ...picks, [i]: id };
    setPicks(next);
    void recordAttempt({
      questionId: `term:${r.termId}`, mode: 'glossary', concepts: [r.termId], sectionId: r.sectionId, difficulty: r.difficulty,
      correct: ok, choiceId: id, confidence: null, responseMs: Date.now() - shownAt.current, sessionId: sessionId.current,
      confusedWith: ok ? undefined : id,
    });
    if (i === rounds.length - 1 && !saved.current) {
      saved.current = true;
      const s = rounds.filter((rr, idx) => next[idx] === rr.answerId).length;
      void markScenarioComplete('terminology', 'terminology', Math.round((s / rounds.length) * 100));
    }
  };
  const goNext = () => { shownAt.current = Date.now(); setI(i + 1); };
  const answer = r.choices.find((c) => c.id === r.answerId)!;

  return (
    <Card>
      <CardHeader title={`Round ${i + 1} of ${rounds.length}`} description={r.kind === 'definition' ? 'Which term matches this definition?' : 'Which term fits in the blank?'}
        action={<Badge>{content.sectionById.get(r.sectionId as never)?.shortName ?? r.sectionId}</Badge>} />
      <CardBody className="space-y-4">
        <Progress value={i} max={rounds.length} label="Rounds completed" />
        <blockquote className="rounded-lg bg-surface-2 p-4 text-base leading-7" data-testid="terminology-prompt">{r.prompt}</blockquote>
        <div role="group" aria-label="Choose a term" className="grid gap-2 sm:grid-cols-2">
          {r.choices.map((c, idx) => {
            const isAns = c.id === r.answerId;
            const isPicked = sel === c.id;
            return (
              <button key={c.id} type="button" disabled={!!sel} aria-pressed={isPicked} onClick={() => choose(c.id)} data-testid="terminology-choice"
                className={cn('flex items-center gap-2 rounded-lg border p-3 text-left text-sm font-medium transition-colors',
                  !sel ? 'border-border bg-surface hover:bg-surface-2' : isAns ? 'border-success bg-success/10' : isPicked ? 'border-danger bg-danger/10' : 'border-border opacity-70')}>
                <span className="text-muted">{String.fromCharCode(65 + idx)}.</span><span className="flex-1">{c.term}</span>
                {sel && isAns && <CheckCircle2 className="h-4 w-4 text-success" aria-label="correct answer" />}
                {sel && isPicked && !isAns && <XCircle className="h-4 w-4 text-danger" aria-label="your answer, incorrect" />}
              </button>
            );
          })}
        </div>
        <div aria-live="polite">
          {sel && (
            <div className="space-y-2 rounded-lg border border-border p-3 text-sm animate-fade-in">
              <p><strong>{sel === r.answerId ? 'Correct.' : `Not quite. The answer is ${answer.term}.`}</strong></p>
              <p className="text-muted">{content.termById.get(r.termId)?.plain}</p>
              <Link to={`/dictionary/${r.termId}`} className="text-primary hover:underline">Open {answer.term} in the dictionary</Link>
            </div>
          )}
        </div>
        {sel && <Button onClick={goNext} data-testid="terminology-next">{i + 1 >= rounds.length ? 'See score' : 'Next round'}<ChevronRight className="h-4 w-4" aria-hidden /></Button>}
      </CardBody>
    </Card>
  );
}
