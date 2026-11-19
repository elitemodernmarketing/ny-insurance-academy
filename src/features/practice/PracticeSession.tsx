import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Flame, Info, LogOut, Timer as TimerIcon, XCircle } from 'lucide-react';
import { content } from '@/content';
import type { Question, ChoiceId } from '@/content/schema';
import { db, type Confidence, type PracticeSessionRow } from '@/db/db';
import { useStudyTimer } from '@/db/hooks';
import { QuestionView, ExplanationPanel, ConfidencePicker, LETTERS } from '@/components/question/QuestionView';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Markdown } from '@/components/ui/Markdown';
import { EmptyState, Kbd, Spinner, Stat } from '@/components/ui/misc';
import { cn } from '@/components/ui/cn';
import { bankQuestions } from './bank';
import {
  advanceSession, answerQuestion, answeredCount, correctCount, countdownOf, feedbackOf, startReviewSession, streaks, summarizeSession,
} from './practiceService';
import { Expandable, ReviewBody, RubricForAnswer, TrapAnalysis, snippet } from './parts';

export default function PracticeSession() {
  const { sessionId = '' } = useParams();
  const [row, setRow] = useState<PracticeSessionRow | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setRow(undefined);
    void db.practiceSessions.get(sessionId).then((r) => { if (live) setRow(r ?? null); });
    return () => { live = false; };
  }, [sessionId]);
  useStudyTimer('practice', row?.status === 'in-progress');

  if (row === undefined) return <Spinner label="Loading session" />;
  if (row === null) {
    return <EmptyState title="Practice session not found" action={<ButtonLink to="/practice">Back to practice</ButtonLink>}>It may have been discarded. Start a new one from the practice page.</EmptyState>;
  }
  if (row.status === 'completed') return <SessionSummary row={row} />;
  return <Runner key={row.id} row={row} onRow={setRow} />;
}

const isTypingTarget = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;

function Runner({ row, onRow }: { row: PracticeSessionRow; onRow: (r: PracticeSessionRow) => void }) {
  const questions = useMemo(() => bankQuestions(row.questionIds), [row.questionIds]);
  const feedback = feedbackOf(row);
  const countdown = countdownOf(row);
  const pos = Math.min(row.index, questions.length - 1);
  const q: Question | undefined = questions[pos];
  const ans = q ? row.answers[q.id] : undefined;
  const order = q ? row.choiceOrders[q.id] ?? q.choices.map((c) => c.id) : [];

  const [sel, setSel] = useState<{ qid: string; choice: string } | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [left, setLeft] = useState(countdown);
  const startRef = useRef(Date.now());
  const nextRef = useRef<HTMLButtonElement>(null);
  const qid = q?.id;
  const selected = sel && sel.qid === qid ? sel.choice : null;

  // New question: reset the per-question state and the response timer.
  useEffect(() => {
    setSel(null); setConfidence(null); setText(''); setDetails(false); setError(null); setLeft(countdown);
    startRef.current = Date.now();
  }, [qid, countdown]);

  const answered = !!ans;
  const shownChoice = ans ? (ans.choiceId || null) : selected;
  const revealNow = answered && feedback === 'immediate';

  const submit = useCallback(async (timedOut = false) => {
    if (!q || busy || row.answers[q.id]) return;
    if (!timedOut && !selected) return;
    setBusy(true); setError(null);
    try {
      const next = await answerQuestion(row.id, q.id, {
        choiceId: timedOut ? null : selected, confidence: timedOut ? null : confidence,
        responseMs: Math.min(Date.now() - startRef.current, 300_000),
        explanation: row.mode === 'explain' ? text : undefined,
      });
      onRow(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your answer');
    } finally { setBusy(false); }
  }, [q, busy, row.answers, row.id, row.mode, selected, confidence, text, onRow]);

  const next = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try { onRow(await advanceSession(row.id)); } finally { setBusy(false); }
  }, [busy, row.id, onRow]);

  const submitRef = useRef(submit); submitRef.current = submit;
  const nextFnRef = useRef(next); nextFnRef.current = next;

  // Rapid-fire countdown.
  useEffect(() => {
    if (!countdown || answered || !qid) return;
    const t = setInterval(() => {
      const remaining = Math.ceil(countdown - (Date.now() - startRef.current) / 1000);
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) { clearInterval(t); void submitRef.current(true); }
    }, 250);
    return () => clearInterval(t);
  }, [countdown, answered, qid]);

  // Enter: submit the selected answer (or go on). Native buttons keep their own Enter behavior.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t instanceof HTMLTextAreaElement) {
        if (!(e.ctrlKey || e.metaKey)) return;
      } else if (e.ctrlKey || e.metaKey || isTypingTarget(t)) return;
      else if (t && (t.tagName === 'BUTTON' || t.tagName === 'A') && t.getAttribute('role') !== 'radio') return;
      e.preventDefault();
      if (!qid) return;
      if (!row.answers[qid]) void submitRef.current();
      else if (feedback === 'immediate') void nextFnRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [qid, row.answers, feedback]);

  // After answering, put focus on the Next button so Enter continues.
  useEffect(() => { if (answered && feedback === 'immediate') nextRef.current?.focus({ preventScroll: true }); }, [answered, feedback, qid]);

  if (!q) {
    return (
      <EmptyState title="These questions are no longer available" action={<ButtonLink to="/practice">Back to practice</ButtonLink>}>
        The questions in this session were removed or need review. Start a new session.
      </EmptyState>
    );
  }

  const total = questions.length;
  const doneN = answeredCount(row);
  const correctN = correctCount(row);
  const st = streaks(row);
  const isLast = pos >= total - 1;
  const rowCorrect = ans?.correct;
  const reason = row.reasons?.[q.id];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold sm:text-xl">{row.title}</h1>
          <ButtonLink to="/practice" variant="ghost" size="sm"><LogOut className="h-4 w-4" aria-hidden />Save and exit</ButtonLink>
        </div>
        <Progress value={doneN} max={total} label={`Answered ${doneN} of ${total}`} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span>Question <strong className="text-fg">{pos + 1}</strong> of {total}</span>
          <span data-testid="practice-score">Score: <strong className="text-fg">{correctN}/{doneN}</strong>{doneN > 0 && <> ({Math.round((correctN / doneN) * 100)}%)</>}</span>
          {row.mode === 'rapid' && <span className="inline-flex items-center gap-1" data-testid="practice-streak"><Flame className="h-4 w-4 text-warning" aria-hidden />Streak: <strong className="text-fg">{st.current}</strong> (best {st.best})</span>}
          {countdown > 0 && !answered && (
            <span role="timer" aria-live="off" className={cn('ml-auto inline-flex items-center gap-1 font-semibold tabular-nums', left <= 5 ? 'text-danger' : 'text-fg')} data-testid="rapid-countdown">
              <TimerIcon className="h-4 w-4" aria-hidden />{left}s
            </span>
          )}
        </div>
      </header>

      <Card>
        <CardBody className="pt-4 sm:pt-5">
          {reason && (
            <p className="mb-3 flex items-start gap-2 rounded-lg bg-info/10 p-2 text-sm" data-testid="weakness-reason"><Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden /><span><strong>Why this question:</strong> {reason}</span></p>
          )}
          <QuestionView
            key={q.id}
            question={q} order={order} selected={shownChoice} reveal={revealNow}
            disabled={answered || busy} keyboard={!answered}
            onSelect={(c: ChoiceId) => qid && setSel({ qid, choice: c })} number={pos + 1} total={total}
          />

          {!answered && row.mode === 'explain' && (
            <div className="mt-4">
              <label htmlFor="explain-text" className="mb-1 block text-sm font-medium">Explain your answer (optional)</label>
              <textarea id="explain-text" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000}
                placeholder="In your own words, why is this the right choice and why are the others wrong?"
                className="w-full rounded-lg border border-border bg-surface p-3 text-sm text-fg placeholder:text-muted" data-testid="explain-text" />
              <p className="mt-1 text-xs text-muted">Press <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> to submit from the text box. Your explanation is checked against the key ideas for this question.</p>
            </div>
          )}

          {!answered && (
            <div className="mt-4 space-y-3">
              <ConfidencePicker value={confidence} onChange={(c) => setConfidence(confidence === c ? null : c)} />
              {error && <p role="alert" className="text-sm text-danger">{error}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={() => void submit()} disabled={!selected || busy} data-testid="practice-submit">{feedback === 'end' ? (isLast ? 'Submit and finish' : 'Submit and continue') : 'Submit answer'}</Button>
                <span className="hidden text-xs text-muted sm:inline">Keys: <Kbd>1</Kbd>–<Kbd>4</Kbd> or <Kbd>A</Kbd>–<Kbd>D</Kbd> to choose, <Kbd>Enter</Kbd> to submit</span>
              </div>
            </div>
          )}

          {answered && feedback === 'immediate' && (
            <div className="mt-4">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <Button ref={nextRef} size="lg" onClick={() => void next()} disabled={busy} data-testid="practice-next">
                  {isLast ? 'See results' : 'Next question'}<ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
                <span className="hidden text-xs text-muted sm:inline"><Kbd>Enter</Kbd> to continue</span>
              </div>
              {row.mode === 'rapid' ? (
                <>
                  <div role="status" aria-live="polite" className={cn('flex flex-wrap items-center gap-2 rounded-xl border p-3 font-medium', rowCorrect ? 'border-success bg-success/10 text-success' : 'border-danger bg-danger/10 text-danger')} data-testid="rapid-feedback">
                    {rowCorrect ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <XCircle className="h-5 w-5" aria-hidden />}
                    {rowCorrect ? 'Correct' : ans?.choiceId ? 'Incorrect' : "Time's up"}
                    {!rowCorrect && <span className="font-normal text-fg">— answer {LETTERS[order.indexOf(q.correct)]}: {q.choices.find((c) => c.id === q.correct)?.text}</span>}
                  </div>
                  <div className="mt-2 text-sm"><Markdown text={q.explanation} /></div>
                  <Button size="sm" variant="ghost" onClick={() => setDetails((d) => !d)} aria-expanded={details}>{details ? 'Hide full explanation' : 'Show full explanation'}</Button>
                  {details && <ExplanationPanel question={q} order={order} selected={ans?.choiceId || null} />}
                </>
              ) : (
                <>
                  {row.mode === 'explain' && <RubricForAnswer question={q} text={ans?.explanation} />}
                  {row.mode === 'tricky' && <TrapAnalysis question={q} order={order} selected={ans?.choiceId || null} />}
                  <ExplanationPanel question={q} order={order} selected={ans?.choiceId || null} />
                </>
              )}
            </div>
          )}
          <div className="sr-only" role="status" aria-live="polite">{answered && feedback === 'end' ? 'Answer saved.' : ''}</div>
        </CardBody>
      </Card>
      {feedback === 'end' && <p className="text-center text-xs text-muted">Answers are saved as you go. Explanations appear when you finish the quiz.</p>}
    </div>
  );
}

function SessionSummary({ row }: { row: PracticeSessionRow }) {
  const nav = useNavigate();
  const questions = useMemo(() => bankQuestions(row.questionIds), [row.questionIds]);
  const s = useMemo(() => summarizeSession(row, questions), [row, questions]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true); setError(null);
    try {
      const r = await startReviewSession(s.missed.map((m) => m.id), `Retry missed: ${row.title}`);
      if (r) nav(`/practice/session/${r.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start the retry'); setBusy(false); }
  }

  const tone = s.pct >= 70 ? 'text-success' : s.pct >= 50 ? 'text-warning' : 'text-danger';
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Session complete</p>
        <h1 className="text-2xl font-bold">{row.title}</h1>
      </header>

      <Card>
        <CardBody className="pt-4 sm:pt-5">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <div className={cn('text-5xl font-bold tabular-nums', tone)} data-testid="practice-final-score">{s.correct}/{s.answered}</div>
              <div className="text-sm text-muted">{s.pct}% correct{s.answered < s.total && ` · ${s.total - s.answered} unanswered`}</div>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Correct" value={s.correct} tone="success" />
              <Stat label="Missed" value={s.incorrect} tone={s.incorrect ? 'danger' : undefined} />
              {row.mode === 'rapid' && <Stat label="Best streak" value={s.bestStreak} />}
              {row.mode === 'explain' && <Stat label="Explanation score" value={s.avgRubricPct === null ? '—' : `${s.avgRubricPct}%`} hint="Key points covered" />}
            </div>
          </div>
          {s.pct >= 70
            ? <p className="mt-3 text-sm text-muted">That is at or above the 70% pass mark used on the real exam. Keep mixing topics so it holds up on test day.</p>
            : <p className="mt-3 text-sm text-muted">Below the 70% pass mark. That is useful information: the missed questions below show exactly what to revisit.</p>}
        </CardBody>
      </Card>

      {s.bySection.length > 0 && (
        <Card>
          <CardHeader title="By section" />
          <CardBody>
            <ul className="space-y-3">
              {s.bySection.map((b) => {
                const sec = content.sectionById.get(b.sectionId as never);
                return (
                  <li key={b.sectionId}>
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{sec?.shortName ?? b.sectionId}</span>
                      <span className="tabular-nums text-muted">{b.correct}/{b.total} ({b.pct}%)</span>
                    </div>
                    <Progress value={b.pct} label={`${sec?.shortName ?? b.sectionId}: ${b.pct}% correct`} tone={b.pct >= 70 ? 'success' : b.pct >= 50 ? 'warning' : 'danger'} />
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      <section aria-labelledby="missed-h" className="space-y-3">
        <h2 id="missed-h" className="text-lg font-semibold">{s.missed.length ? `Questions to review (${s.missed.length})` : 'Questions to review'}</h2>
        {s.missed.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">{s.answered ? 'No missed questions in this session. Nicely done.' : 'No answers were recorded in this session.'}</p>
        ) : (
          s.missed.map((q) => {
            const a = row.answers[q.id];
            return (
              <Expandable key={q.id} testId="missed-question" header={
                <span>
                  <span className="block text-sm font-medium">{snippet(q, 140)}</span>
                  <span className="mt-1 flex flex-wrap gap-2"><Badge>{content.sectionById.get(q.sectionId)?.shortName}</Badge>{!a.choiceId && <Badge tone="warning">Not answered</Badge>}</span>
                </span>
              }>
                <ReviewBody question={q} order={row.choiceOrders[q.id] ?? q.choices.map((c) => c.id)} selected={a.choiceId || null}
                  extra={row.mode === 'explain' && a.explanation ? <RubricForAnswer question={q} text={a.explanation} /> : undefined} />
              </Expandable>
            );
          })
        )}
        {s.queuedConcepts.length > 0 && (
          <p className="flex items-start gap-2 rounded-lg bg-accent/10 p-3 text-sm" data-testid="flashcards-note">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            <span>The {s.queuedConcepts.length} concept{s.queuedConcepts.length === 1 ? '' : 's'} behind missed or guessed questions {s.queuedConcepts.length === 1 ? 'was' : 'were'} added to your <Link to="/flashcards" className="font-medium text-primary hover:underline">flashcards</Link> automatically.</span>
          </p>
        )}
      </section>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-3">
        {s.missed.length > 0 && <Button onClick={() => void retry()} disabled={busy} data-testid="retry-missed">Retry missed questions ({s.missed.length})</Button>}
        <ButtonLink to="/practice" variant={s.missed.length ? 'outline' : 'primary'} data-testid="new-session">New session</ButtonLink>
        <ButtonLink to="/practice" variant="ghost">Back to practice</ButtonLink>
      </div>
    </div>
  );
}
