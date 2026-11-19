import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Flag, Maximize2, Minimize2, Send, Timer as TimerIcon, Eraser } from 'lucide-react';
import type { ChoiceId, Question } from '@/content/schema';
import { db, type ExamSessionRow } from '@/db/db';
import { useSettings, useStudyTimer } from '@/db/hooks';
import { updateSettings } from '@/db/repo';
import { formatClock, remainingMs } from '@/lib/timer';
import { QuestionView } from '@/components/question/QuestionView';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, Kbd, Spinner } from '@/components/ui/misc';
import { cn } from '@/components/ui/cn';
import { ButtonLink } from '@/components/ui/Button';
import { bankQuestions } from '../practice/bank';
import { snippet } from '../practice/parts';
import {
  alreadyCrossed, examLabel, nextAnnouncement, persistExam, shouldAutoSubmit, submitExam, withAnswer, withFlagToggled, withIndex, withTimeAdded, type ExamTransform,
} from './examService';

export default function ExamSession() {
  const { sessionId = '' } = useParams();
  const [row, setRow] = useState<ExamSessionRow | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setRow(undefined);
    void db.examSessions.get(sessionId).then((r) => { if (live) setRow(r ?? null); });
    return () => { live = false; };
  }, [sessionId]);

  if (row === undefined) return <Spinner label="Loading exam" />;
  if (row === null) return <EmptyState title="Exam not found" action={<ButtonLink to="/exam">Back to mock exams</ButtonLink>}>It may have been discarded.</EmptyState>;
  if (row.status === 'submitted') return <Navigate to={`/exam/${row.id}/results`} replace />;
  return <Runner key={row.id} initial={row} />;
}

const typing = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;

function Runner({ initial }: { initial: ExamSessionRow }) {
  const nav = useNavigate();
  const settings = useSettings();
  const id = initial.id;
  const [row, setRow] = useState<ExamSessionRow>(initial);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<'exam' | 'review'>('exam');
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState<null | 'manual' | 'auto'>(null);
  const [announce, setAnnounce] = useState('');
  const [navOpen, setNavOpen] = useState(() => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1024px)').matches : true));
  const [error, setError] = useState<string | null>(null);

  useStudyTimer('exam', !submitting);

  const questions = useMemo(() => bankQuestions(row.questionIds), [row.questionIds]);
  const index = Math.max(0, Math.min(questions.length - 1, row.currentIndex));
  const q: Question | undefined = questions[index];
  const qid = q?.id;

  // ---- persistence: every change is applied to the UI and queued to the db in order.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const mutate = useCallback((fn: ExamTransform) => {
    setRow((r) => fn(r));
    queue.current = queue.current.then(() => persistExam(id, fn)).catch(() => undefined);
  }, [id]);

  // ---- time on question (visible time only)
  const timing = useRef<{ qid: string; t: number } | null>(null);
  const stopTiming = useCallback(() => {
    const cur = timing.current;
    timing.current = null;
    if (!cur) return;
    const d = Date.now() - cur.t;
    if (d > 0) mutate(withTimeAdded(cur.qid, d));
  }, [mutate]);
  const curQid = useRef<string | undefined>(qid); curQid.current = qid;
  const viewRef = useRef(view); viewRef.current = view;
  useEffect(() => {
    if (view !== 'exam' || !qid || submitting) return;
    timing.current = { qid, t: Date.now() };
    return () => stopTiming();
  }, [qid, view, submitting, stopTiming]);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') stopTiming();
      else if (viewRef.current === 'exam' && curQid.current && !timing.current) timing.current = { qid: curQid.current, t: Date.now() };
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', stopTiming);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', stopTiming); };
  }, [stopTiming]);

  // ---- submission
  const submittingRef = useRef(false);
  const doSubmit = useCallback(async (auto: boolean) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(auto ? 'auto' : 'manual');
    setConfirm(false);
    try {
      stopTiming();
      await queue.current;
      await submitExam(id, { auto });
      nav(`/exam/${id}/results`, { replace: true });
    } catch (e) {
      submittingRef.current = false;
      setSubmitting(null);
      setError(e instanceof Error ? e.message : 'Could not submit the exam. Your answers are saved; try again.');
    }
  }, [id, nav, stopTiming]);

  // Past the deadline when opened: submit immediately.
  useEffect(() => { if (shouldAutoSubmit(initial, Date.now())) void doSubmit(true); }, [initial, doSubmit]);

  // ---- clock + announcements
  const announced = useRef<Set<number>>(alreadyCrossed(remainingMs(initial.deadline, Date.now()), initial.timeLimitMin));
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= row.deadline) { void doSubmit(true); return; }
      const a = nextAnnouncement(remainingMs(row.deadline, n), announced.current, row.timeLimitMin);
      announced.current = a.announced;
      if (a.message) setAnnounce(a.message);
    }, 500);
    return () => clearInterval(t);
  }, [row.deadline, row.timeLimitMin, doSubmit]);
  useEffect(() => { if (!announce) return; const t = setTimeout(() => setAnnounce(''), 12_000); return () => clearTimeout(t); }, [announce]);

  const remaining = remainingMs(row.deadline, now);
  const low = remaining <= 5 * 60_000;

  // ---- actions
  const go = useCallback((i: number) => mutate(withIndex(i)), [mutate]);
  const select = useCallback((c: ChoiceId) => { if (qid) mutate(withAnswer(qid, c)); }, [mutate, qid]);
  const toggleFlag = useCallback(() => { if (qid) mutate(withFlagToggled(qid)); }, [mutate, qid]);
  const jump = useCallback((i: number) => { setView('exam'); go(i); }, [go]);

  const stateRef = useRef({ index, total: questions.length, view, confirm }); stateRef.current = { index, total: questions.length, view, confirm };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (s.view !== 'exam' || s.confirm || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if ((e.target as HTMLElement | null)?.closest?.('[data-exam-nav]')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); if (s.index < s.total - 1) go(s.index + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (s.index > 0) go(s.index - 1); }
      else if (e.key.toLowerCase() === 'f') { e.preventDefault(); toggleFlag(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, toggleFlag]);

  // ---- navigator (roving tabindex)
  const gridRef = useRef<HTMLDivElement>(null);
  const onGridKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const items = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>('button[data-qi]') ?? []);
    const cur = items.findIndex((b) => b === document.activeElement);
    if (cur < 0) return;
    let cols = 1;
    while (cols < items.length && items[cols].offsetTop === items[0].offsetTop) cols++;
    if (cols >= items.length || cols === 1) cols = 8;
    const nextI = e.key === 'ArrowRight' ? cur + 1 : e.key === 'ArrowLeft' ? cur - 1 : e.key === 'ArrowDown' ? cur + cols : e.key === 'ArrowUp' ? cur - cols : e.key === 'Home' ? 0 : items.length - 1;
    const target = items[Math.max(0, Math.min(items.length - 1, nextI))];
    e.preventDefault();
    target?.focus();
  };

  if (!q) {
    return <EmptyState title="The questions in this exam are no longer available" action={<ButtonLink to="/exam">Back to mock exams</ButtonLink>}>Start a new exam from the mock exam page.</EmptyState>;
  }

  if (submitting) {
    return (
      <div className="mx-auto max-w-md py-16 text-center" role="status" aria-live="assertive" data-testid="exam-submitting">
        <Spinner label={submitting === 'auto' ? "Time is up. Submitting your exam" : 'Submitting your exam'} />
        {error && <p role="alert" className="text-danger">{error}</p>}
      </div>
    );
  }

  const answered = row.questionIds.filter((i) => row.answers[i]).length;
  const flagged = new Set(row.flags);
  const order = row.choiceOrders[q.id] ?? q.choices.map((c) => c.id);
  const unansweredIdx = questions.map((x, i) => (row.answers[x.id] ? -1 : i)).filter((i) => i >= 0);
  const flaggedIdx = questions.map((x, i) => (flagged.has(x.id) ? i : -1)).filter((i) => i >= 0);

  const header = (
    <div className={cn('sticky z-10 -mx-4 mb-4 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6', settings.focusMode ? 'top-14' : 'top-14 lg:top-0')}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">
          <div className="truncate text-sm font-semibold">{examLabel(row)}</div>
          <div className="text-xs text-muted" data-testid="exam-answered">Answered {answered} of {questions.length}{flagged.size > 0 && ` · ${flagged.size} flagged`}</div>
        </div>
        <div className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-lg font-bold tabular-nums', low ? 'border-danger bg-danger/10 text-danger' : 'border-border bg-surface-2')}
          role="timer" aria-live="off" aria-label={`Time remaining ${formatClock(remaining)}`} data-testid="exam-timer">
          <TimerIcon className="h-4 w-4" aria-hidden />{formatClock(remaining)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => void updateSettings({ focusMode: !settings.focusMode })} aria-pressed={settings.focusMode}>
            {settings.focusMode ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}{settings.focusMode ? 'Exit focus mode' : 'Focus mode'}
          </Button>
          {view === 'exam'
            ? <Button size="sm" onClick={() => setView('review')} data-testid="exam-review-submit"><Send className="h-4 w-4" aria-hidden />Review &amp; Submit</Button>
            : <Button size="sm" variant="outline" onClick={() => setView('exam')}><ArrowLeft className="h-4 w-4" aria-hidden />Back to exam</Button>}
        </div>
      </div>
      <div role="status" aria-live="polite" className={cn('mx-auto max-w-6xl text-sm font-medium', announce ? 'pt-1 text-warning' : 'sr-only')} data-testid="exam-announce">{announce}</div>
    </div>
  );

  if (view === 'review') {
    return (
      <div>
        {header}
        <div className="mx-auto max-w-3xl space-y-4">
          <h1 className="text-2xl font-bold">Review &amp; Submit</h1>
          <p className="text-sm text-muted">Check unanswered and flagged questions before you submit. Unanswered questions count as incorrect. You cannot change answers after submitting.</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-border bg-surface p-3"><div className="text-2xl font-bold tabular-nums">{answered}</div><div className="text-xs text-muted">Answered</div></div>
            <div className="rounded-xl border border-border bg-surface p-3"><div className={cn('text-2xl font-bold tabular-nums', unansweredIdx.length && 'text-warning')}>{unansweredIdx.length}</div><div className="text-xs text-muted">Unanswered</div></div>
            <div className="rounded-xl border border-border bg-surface p-3"><div className="text-2xl font-bold tabular-nums">{flaggedIdx.length}</div><div className="text-xs text-muted">Flagged</div></div>
          </div>
          <Card><CardBody className="pt-4">
            <h2 className="mb-2 font-semibold">Unanswered ({unansweredIdx.length})</h2>
            {unansweredIdx.length === 0 ? <p className="text-sm text-success">Every question has an answer.</p> : (
              <ul className="flex flex-wrap gap-2" data-testid="review-unanswered">
                {unansweredIdx.map((i) => <li key={i}><Button size="sm" variant="outline" onClick={() => jump(i)} aria-label={`Go to unanswered question ${i + 1}`}>Q{i + 1}</Button></li>)}
              </ul>
            )}
          </CardBody></Card>
          <Card><CardBody className="pt-4">
            <h2 className="mb-2 font-semibold">Flagged for review ({flaggedIdx.length})</h2>
            {flaggedIdx.length === 0 ? <p className="text-sm text-muted">No questions are flagged.</p> : (
              <ul className="space-y-2" data-testid="review-flagged">
                {flaggedIdx.map((i) => (
                  <li key={i}><button type="button" onClick={() => jump(i)} className="flex w-full items-start gap-2 rounded-lg border border-border p-2 text-left text-sm hover:bg-surface-2" aria-label={`Go to flagged question ${i + 1}`}>
                    <Flag className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden /><span><strong>Q{i + 1}</strong> · {snippet(questions[i], 90)}{!row.answers[questions[i].id] && <Badge tone="warning" className="ml-2">unanswered</Badge>}</span>
                  </button></li>
                ))}
              </ul>
            )}
          </CardBody></Card>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setView('exam')}><ArrowLeft className="h-4 w-4" aria-hidden />Back to exam</Button>
            <Button size="lg" onClick={() => setConfirm(true)} data-testid="exam-submit-final"><Send className="h-4 w-4" aria-hidden />Submit exam</Button>
          </div>
        </div>
        <Dialog open={confirm} onOpenChange={setConfirm} title="Submit your exam?"
          description={unansweredIdx.length ? `You have ${unansweredIdx.length} unanswered question${unansweredIdx.length === 1 ? '' : 's'}. They will count as incorrect. This cannot be undone.` : 'Your answers will be scored and cannot be changed afterwards.'}
          footer={<><Button variant="outline" onClick={() => setConfirm(false)}>Keep working</Button><Button onClick={() => void doSubmit(false)} data-testid="exam-confirm-submit">Submit and see results</Button></>} />
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardBody className="pt-4 sm:pt-5">
              <QuestionView key={q.id} question={q} order={order} selected={row.answers[q.id] ?? null} onSelect={select} keyboard number={index + 1} total={questions.length} showMeta={false} />
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <Button variant="outline" onClick={() => go(index - 1)} disabled={index === 0} data-testid="exam-prev" aria-keyshortcuts="ArrowLeft"><ArrowLeft className="h-4 w-4" aria-hidden />Previous</Button>
                <Button onClick={() => go(index + 1)} disabled={index >= questions.length - 1} data-testid="exam-next" aria-keyshortcuts="ArrowRight">Next<ArrowRight className="h-4 w-4" aria-hidden /></Button>
                <Button variant={flagged.has(q.id) ? 'secondary' : 'outline'} onClick={toggleFlag} aria-pressed={flagged.has(q.id)} data-testid="exam-flag" aria-keyshortcuts="F">
                  <Flag className={cn('h-4 w-4', flagged.has(q.id) && 'text-warning')} aria-hidden />{flagged.has(q.id) ? 'Flagged' : 'Flag for review'}
                </Button>
                {row.answers[q.id] && <Button variant="ghost" size="sm" onClick={() => mutate(withAnswer(q.id, null))}><Eraser className="h-4 w-4" aria-hidden />Clear answer</Button>}
              </div>
              <p className="mt-3 hidden text-xs text-muted sm:block"><Kbd>1</Kbd>–<Kbd>4</Kbd> or <Kbd>A</Kbd>–<Kbd>D</Kbd> choose · <Kbd>←</Kbd> <Kbd>→</Kbd> move · <Kbd>F</Kbd> flag. Answers are saved instantly and no feedback is shown until you submit.</p>
            </CardBody>
          </Card>
        </div>

        <aside aria-label="Question navigator" className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardBody className="pt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Questions</h2>
                <Button size="sm" variant="ghost" onClick={() => setNavOpen((o) => !o)} aria-expanded={navOpen} aria-controls="exam-nav-grid">{navOpen ? 'Hide' : 'Show'}</Button>
              </div>
              {navOpen && (
                <>
                  <div id="exam-nav-grid" ref={gridRef} data-exam-nav onKeyDown={onGridKey} role="group" aria-label="Jump to question"
                    className="mt-2 grid max-h-[50vh] grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1.5 overflow-y-auto p-1">
                    {questions.map((x, i) => {
                      const isA = !!row.answers[x.id], isF = flagged.has(x.id), isC = i === index;
                      return (
                        <button key={x.id} type="button" data-qi={i} data-testid={`nav-q-${i + 1}`} tabIndex={isC ? 0 : -1} onClick={() => go(i)}
                          aria-current={isC ? 'true' : undefined}
                          aria-label={`Question ${i + 1}: ${isA ? 'answered' : 'unanswered'}${isF ? ', flagged' : ''}${isC ? ', current' : ''}`}
                          className={cn('relative flex h-10 items-center justify-center rounded-md border text-sm font-medium tabular-nums transition-colors',
                            isC ? 'border-primary bg-primary text-primary-fg' : isA ? 'border-primary/40 bg-primary/15 text-fg' : 'border-border bg-surface text-muted hover:bg-surface-2',
                            isF && !isC && 'border-warning ring-1 ring-warning')}>
                          {i + 1}
                          {isF && <Flag className={cn('absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-surface p-0.5', isC ? 'text-warning' : 'text-warning')} aria-hidden />}
                        </button>
                      );
                    })}
                  </div>
                  <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted">
                    <li><span className="mr-1 inline-block h-3 w-3 rounded-sm border border-primary bg-primary align-middle" aria-hidden />Current</li>
                    <li><span className="mr-1 inline-block h-3 w-3 rounded-sm border border-primary/40 bg-primary/15 align-middle" aria-hidden />Answered</li>
                    <li><span className="mr-1 inline-block h-3 w-3 rounded-sm border border-border bg-surface align-middle" aria-hidden />Unanswered</li>
                    <li><Flag className="mr-1 inline h-3 w-3 text-warning" aria-hidden />Flagged</li>
                  </ul>
                </>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
