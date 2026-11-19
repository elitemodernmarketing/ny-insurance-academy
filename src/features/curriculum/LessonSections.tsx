import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { RotateCcw, Trophy } from 'lucide-react';
import type { GlossaryTerm, Lesson, Question } from '@/content/schema';
import { content } from '@/content';
import { db } from '@/db/db';
import { recordAttempt, reviewCard } from '@/db/repo';
import { choiceOrder } from '@/lib/selection';
import { review, newCard, type Rating } from '@/lib/srs';
import { QuestionView, ExplanationPanel, ConfidencePicker, detectConfusion } from '@/components/question/QuestionView';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Progress } from '@/components/ui/Progress';
import type { Confidence } from '@/db/db';
import { InlineMcq } from './InlineMcq';
import { lessonQuizPool } from './helpers';
import { formatInterval } from '@/features/flashcards/cardLogic';

// ------------------------------------------------------------------ knowledge checks
export function KnowledgeChecks({ lesson, onChange }: { lesson: Lesson; onChange: (s: { answered: number; correct: number }) => void }) {
  const n = lesson.knowledgeChecks.length;
  const [answers, setAnswers] = useState<(number | null)[]>(() => Array(n).fill(null));
  const [rounds, setRounds] = useState<number[]>(() => Array(n).fill(0));
  const shownAt = useRef<number[]>(Array(n).fill(Date.now()));
  const hydrated = useRef(false);

  // Restore earlier answers (latest attempt per knowledge check) so a revisit doesn't lose progress.
  useEffect(() => {
    let alive = true;
    void db.attempts.where('questionId').startsWith(`lesson:${lesson.id}:`).toArray().then((rows) => {
      if (!alive) return;
      const latest = new Map<number, number>();
      for (const r of rows.sort((a, b) => a.at - b.at)) {
        const i = Number(r.questionId.split(':')[2]);
        if (Number.isInteger(i) && i < n && r.choiceId !== null) latest.set(i, Number(r.choiceId));
      }
      hydrated.current = true;
      setAnswers((cur) => cur.map((v, i) => (v === null && latest.has(i) ? latest.get(i)! : v)));
    });
    return () => { alive = false; };
  }, [lesson.id, n]);

  useEffect(() => {
    const answered = answers.filter((a) => a !== null).length;
    const correct = answers.filter((a, i) => a !== null && a === lesson.knowledgeChecks[i].answerIndex).length;
    onChange({ answered, correct });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, lesson.id]);

  const choose = (i: number, orig: number) => {
    if (answers[i] !== null) return;
    setAnswers((a) => a.map((v, k) => (k === i ? orig : v)));
    void recordAttempt({
      questionId: `lesson:${lesson.id}:${i}`, sectionId: lesson.sectionId, concepts: [], difficulty: 1,
      correct: orig === lesson.knowledgeChecks[i].answerIndex, choiceId: String(orig), confidence: null,
      responseMs: Date.now() - shownAt.current[i], mode: 'lesson-quiz', sessionId: `lesson:${lesson.id}`,
    });
  };
  return (
    <div className="space-y-6">
      {lesson.knowledgeChecks.map((mcq, i) => (
        <div key={i} className={cn(i > 0 && 'border-t border-border pt-5')} data-testid="knowledge-check">
          <InlineMcq mcq={mcq} number={i + 1} seed={`${lesson.id}:kc:${i}:${rounds[i]}`} selected={answers[i]} onSelect={(o) => choose(i, o)}
            onRetry={() => { shownAt.current[i] = Date.now(); setAnswers((a) => a.map((v, k) => (k === i ? null : v))); setRounds((r) => r.map((v, k) => (k === i ? v + 1 : v))); }} />
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ key term flashcards
const RATINGS: { r: Rating; label: string }[] = [{ r: 'again', label: 'Again' }, { r: 'hard', label: 'Hard' }, { r: 'good', label: 'Good' }, { r: 'easy', label: 'Easy' }];

export function KeyTermFlashcards({ terms }: { terms: GlossaryTerm[] }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [rated, setRated] = useState<Record<string, Rating>>({});
  const [busy, setBusy] = useState(false);
  const cards = useLiveQuery(() => db.cards.bulkGet(terms.map((t) => t.id)), [terms]);
  if (terms.length === 0) return <p className="text-sm text-muted">No key-term cards available for this lesson yet.</p>;

  if (i >= terms.length)
    return (
      <div className="rounded-xl bg-success/10 p-4 text-center" role="status">
        <Trophy className="mx-auto mb-2 h-6 w-6 text-success" aria-hidden />
        <p className="font-semibold">Reviewed {Object.keys(rated).length} key term{Object.keys(rated).length === 1 ? '' : 's'}.</p>
        <p className="text-sm text-muted">Your ratings were scheduled in your flashcard deck.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => { setI(0); setFlipped(false); setRated({}); }}><RotateCcw className="h-4 w-4" aria-hidden />Review again</Button>
      </div>
    );

  const t = terms[i];
  const cur = cards?.[i]?.srs ?? newCard(Date.now());
  const rate = async (r: Rating) => {
    if (busy) return;
    setBusy(true);
    await reviewCard(t.id, r, 'term-def');
    setRated((x) => ({ ...x, [t.id]: r }));
    setFlipped(false);
    setI((v) => v + 1);
    setBusy(false);
  };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm text-muted"><span>Card {i + 1} of {terms.length}</span></div>
      <Progress value={i} max={terms.length} label="Key term review progress" className="mb-3" />
      <div className="flip-scene">
        <div className={cn('flip-card grid', flipped && 'is-flipped')}>
          <div className="flip-face col-start-1 row-start-1 flex min-h-[11rem] flex-col items-center justify-center rounded-xl border border-border bg-surface-2 p-5 text-center" aria-hidden={flipped}>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Term</div>
            <div className="mt-2 text-2xl font-bold">{t.term}</div>
            {t.pronunciation && <div className="mt-1 font-mono text-sm text-muted">{t.pronunciation}</div>}
          </div>
          <div className="flip-face flip-back col-start-1 row-start-1 flex min-h-[11rem] flex-col justify-center rounded-xl border border-primary/40 bg-surface p-5" aria-hidden={!flipped}>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t.term}</div>
            <p className="mt-2 leading-7">{t.plain}</p>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setFlipped((f) => !f)} aria-pressed={flipped} data-testid="mini-flip">{flipped ? 'Show term' : 'Show definition'}</Button>
        {flipped && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="How well did you remember it?">
            {RATINGS.map(({ r, label }) => (
              <Button key={r} size="sm" variant={r === 'again' ? 'outline' : r === 'good' ? 'primary' : 'secondary'} disabled={busy} onClick={() => void rate(r)} data-testid={`mini-rate-${r}`}>
                {label}<span className="text-xs opacity-75">{formatInterval(review(cur, r, Date.now()).due - Date.now())}</span>
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ end-of-lesson quiz
export function LessonQuiz({ lesson, onFinish }: { lesson: Lesson; onFinish: (pct: number) => void }) {
  const [round, setRound] = useState(0);
  const pool = useMemo<Question[]>(() => lessonQuizPool(lesson, content.questions, round, 5), [lesson, round]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const shownAt = useRef(Date.now());

  if (pool.length === 0)
    return <p className="text-sm text-muted" data-testid="quiz-empty">No bank questions match this lesson yet. Try a topic quiz from the section page once more questions are added.</p>;

  if (finished) {
    const pct = Math.round((correctCount / pool.length) * 100);
    return (
      <div className="rounded-xl bg-surface-2 p-4 text-center" role="status" data-testid="quiz-result">
        <Trophy className="mx-auto mb-2 h-6 w-6 text-primary" aria-hidden />
        <p className="text-lg font-semibold">{correctCount} of {pool.length} correct ({pct}%)</p>
        <p className="text-sm text-muted">{pct >= 80 ? 'Strong work. You’re ready to mark this lesson complete.' : 'Review the explanations above, or re-read the parts you missed, then retake the quiz.'}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => { setRound((r) => r + 1); setIndex(0); setSelected(null); setConfidence(null); setRevealed(false); setCorrectCount(0); setFinished(false); shownAt.current = Date.now(); }}>
          <RotateCcw className="h-4 w-4" aria-hidden />Retake with new questions
        </Button>
      </div>
    );
  }

  const q = pool[index];
  const order = choiceOrder(['a', 'b', 'c', 'd'], `${lesson.id}:${q.id}:${round}`);
  const check = () => {
    if (!selected) return;
    const correct = selected === q.correct;
    setRevealed(true);
    if (correct) setCorrectCount((c) => c + 1);
    void recordAttempt({
      questionId: q.id, sectionId: q.sectionId, concepts: q.concepts, difficulty: q.difficulty, correct, choiceId: selected,
      confidence, responseMs: Date.now() - shownAt.current, mode: 'lesson-quiz', sessionId: `lesson-quiz:${lesson.id}`,
      confusedWith: detectConfusion(q, selected), contentVersion: q.version,
    });
  };
  const advance = () => {
    if (index + 1 >= pool.length) {
      setFinished(true);
      onFinish(Math.round((correctCount / pool.length) * 100));
      return;
    }
    setIndex(index + 1); setSelected(null); setConfidence(null); setRevealed(false); shownAt.current = Date.now();
  };
  return (
    <div data-testid="lesson-quiz">
      <QuestionView key={q.id} question={q} order={order} selected={selected} onSelect={(c) => !revealed && setSelected(c)} reveal={revealed} disabled={revealed} number={index + 1} total={pool.length} />
      {!revealed ? (
        <div className="mt-4 space-y-3">
          <ConfidencePicker value={confidence} onChange={setConfidence} />
          <Button onClick={check} disabled={!selected} data-testid="quiz-check">Check answer</Button>
        </div>
      ) : (
        <>
          <ExplanationPanel question={q} order={order} selected={selected} />
          <Button className="mt-4" onClick={advance} data-testid="quiz-next">{index + 1 >= pool.length ? 'See results' : 'Next question'}</Button>
        </>
      )}
    </div>
  );
}
