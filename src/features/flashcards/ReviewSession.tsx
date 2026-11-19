import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Keyboard, RotateCw, Trophy, XCircle } from 'lucide-react';
import { content } from '@/content';
import type { GlossaryTerm } from '@/content/schema';
import { db, type CardMode, type CardRow } from '@/db/db';
import { reviewCard } from '@/db/repo';
import { newCard, type Rating, type SrsState } from '@/lib/srs';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { Kbd, Stat } from '@/components/ui/misc';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/components/ui/cn';
import { SpeakButton } from '@/components/ui/Speak';
import { getTerm } from '@/features/dictionary/termHelpers';
import { allowedRatings, buildMultipleChoice, cardTypeAt, formatDue, isTypedAnswerCorrect, previewIntervals, scenarioFor, summarize, type CardTypeChoice } from './cardLogic';

const RATING_META: { r: Rating; label: string; key: string }[] = [
  { r: 'again', label: 'Again', key: '1' }, { r: 'hard', label: 'Hard', key: '2' }, { r: 'good', label: 'Good', key: '3' }, { r: 'easy', label: 'Easy', key: '4' },
];
const REQUEUE_LIMIT = 2;

function isFormTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
}

export function ReviewSession({ ids, cardType, cards, onExit }: { ids: string[]; cardType: CardTypeChoice; cards: Map<string, CardRow>; onExit: () => void }) {
  const [queue, setQueue] = useState<string[]>(ids);
  const [pos, setPos] = useState(0);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [srsMap, setSrsMap] = useState<Map<string, SrsState>>(() => new Map([...cards].map(([k, v]) => [k, v.srs])));
  const requeues = useRef<Map<string, number>>(new Map());
  const startedAt = useRef(Date.now());

  const done = pos >= queue.length;
  const termId = queue[pos];
  const term = termId ? getTerm(termId) : undefined;
  const mode = cardTypeAt(cardType, pos);

  const onRate = useCallback(async (rating: Rating, usedMode: CardMode) => {
    if (!termId) return;
    const row = await reviewCard(termId, rating, usedMode);
    setSrsMap((m) => new Map(m).set(termId, row.srs));
    setRatings((r) => [...r, rating]);
    if (rating === 'again') {
      const n = requeues.current.get(termId) ?? 0;
      if (n < REQUEUE_LIMIT) {
        requeues.current.set(termId, n + 1);
        setQueue((q) => { const nq = q.slice(); nq.splice(Math.min(nq.length, pos + 1 + 3), 0, termId); return nq; });
      }
    }
    setPos((p) => p + 1);
  }, [termId, pos]);

  if (done)
    return <Summary ratings={ratings} seconds={Math.round((Date.now() - startedAt.current) / 1000)} onExit={onExit} />;
  if (!term) {
    // Card refers to content that is no longer available: skip it.
    return <div role="status" className="p-6"><Button onClick={() => setPos((p) => p + 1)}>Skip unavailable card</Button></div>;
  }
  return (
    <div className="mx-auto max-w-2xl" data-testid="review-session">
      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium" aria-live="polite">Card {pos + 1} of {queue.length}</span>
        <Button variant="ghost" size="sm" onClick={() => setPos(queue.length)} data-testid="end-session">End session</Button>
      </div>
      <Progress value={pos} max={queue.length} label="Session progress" className="mb-4" />
      <CardRunner key={`${pos}:${termId}`} term={term} mode={mode} srs={srsMap.get(term.id) ?? newCard(Date.now())} seed={pos} onRate={(r) => onRate(r, mode)} />
    </div>
  );
}

// ------------------------------------------------------------------ one card
function CardRunner({ term, mode, srs, seed, onRate }: { term: GlossaryTerm; mode: CardMode; srs: SrsState; seed: number; onRate: (r: Rating) => Promise<void> }) {
  const [flipped, setFlipped] = useState(false);
  const [revealed, setRevealed] = useState(false); // answer has been seen → rating enabled
  const [correct, setCorrect] = useState<boolean | null>(null); // objective result for MC / typed
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const now = useMemo(() => Date.now(), []);
  const preview = useMemo(() => previewIntervals(srs, now), [srs, now]);
  const allowed = allowedRatings(correct);
  const flipRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mc = useMemo(() => (mode === 'multiple-choice' ? buildMultipleChoice(term, content.terms, seed) : null), [mode, term, seed]);
  const scenario = useMemo(() => (mode === 'scenario' ? scenarioFor(term, seed) : ''), [mode, term, seed]);
  const selfGraded = mode === 'term-def' || mode === 'def-term' || mode === 'scenario';

  const flip = useCallback(() => { setFlipped((f) => !f); setRevealed(true); }, []);
  const rate = useCallback(async (r: Rating) => {
    if (busy || !revealed || !allowed.includes(r)) return;
    setBusy(true);
    try { await onRate(r); } finally { setBusy(false); }
  }, [busy, revealed, allowed, onRate]);

  useEffect(() => { (selfGraded ? flipRef.current : inputRef.current)?.focus({ preventScroll: true }); }, [selfGraded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isFormTarget(e.target)) return;
      if (e.key === ' ' && selfGraded) {
        // Native buttons/links handle Space themselves; avoid a double flip.
        if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
        e.preventDefault(); flip(); return;
      }
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i >= 0 && revealed) { e.preventDefault(); void rate(RATING_META[i].r); }
      if (mode === 'multiple-choice' && mc && picked === null) {
        const k = ['a', 'b', 'c', 'd'].indexOf(e.key.toLowerCase());
        if (k >= 0 && k < mc.choices.length && !revealed) { /* letters pick; digits are reserved for rating */ choose(k); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, selfGraded, flip, rate, picked, mc, mode]);

  const choose = (i: number) => {
    if (!mc || picked !== null) return;
    setPicked(i);
    setCorrect(i === mc.answerIndex);
    setRevealed(true);
  };
  const checkTyped = (e: React.FormEvent) => {
    e.preventDefault();
    if (revealed) return;
    setCorrect(isTypedAnswerCorrect(typed, term));
    setRevealed(true);
  };
  const giveUp = () => { setCorrect(false); setRevealed(true); };

  const typeLabel = { 'term-def': 'Term → Definition', 'def-term': 'Definition → Term', scenario: 'Scenario → Concept', 'multiple-choice': 'Multiple choice', typed: 'Type the answer' }[mode];
  const sec = content.sectionById.get(term.sectionId);

  const front = (
    <>
      {mode === 'term-def' && (<><Label>Term</Label><div className="mt-2 text-3xl font-bold">{term.term}</div>{term.pronunciation && <div className="mt-1 font-mono text-sm text-muted">{term.pronunciation}</div>}</>)}
      {mode === 'def-term' && (<><Label>Definition — what is the term?</Label><p className="mt-2 text-lg leading-7">{term.plain}</p></>)}
      {mode === 'scenario' && (<><Label>Scenario — which concept is this?</Label><p className="mt-2 text-lg leading-7">{scenario}</p></>)}
    </>
  );
  const back = (
    <>
      {mode === 'term-def' ? (
        <><Label>{term.term}</Label><p className="mt-2 leading-7">{term.plain}</p><p className="mt-2 text-sm leading-6 text-muted">{term.formal}</p></>
      ) : (
        <><Label>Answer</Label><div className="mt-2 text-2xl font-bold">{term.term}</div>
          {term.aliases.length > 0 && <div className="text-sm text-muted">Also: {term.aliases.join(', ')}</div>}
          <p className="mt-2 leading-7">{term.plain}</p></>
      )}
    </>
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <Badge>{typeLabel}</Badge>{sec && <Badge>{sec.shortName}</Badge>}
        <span className="ml-auto"><SpeakButton text={mode === 'def-term' || mode === 'scenario' ? (revealed ? term.term : term.plain) : term.term} label="Read card aloud" /></span>
      </div>

      {selfGraded && (
        <>
          <div className="flip-scene">
            <div className={cn('flip-card grid', flipped && 'is-flipped')}>
              <div className="flip-face col-start-1 row-start-1 flex min-h-[14rem] flex-col items-center justify-center rounded-2xl border border-border bg-surface p-6 text-center shadow-sm" aria-hidden={flipped} data-testid="card-front">{front}</div>
              <div className="flip-face flip-back col-start-1 row-start-1 flex min-h-[14rem] flex-col justify-center rounded-2xl border border-primary/40 bg-surface p-6 shadow-sm" aria-hidden={!flipped} data-testid="card-back">{back}</div>
            </div>
          </div>
          <div className="mt-4 flex justify-center">
            <Button ref={flipRef} size="lg" variant={revealed ? 'outline' : 'primary'} onClick={flip} aria-pressed={flipped} data-testid="flashcard-flip">
              <RotateCw className="h-4 w-4" aria-hidden />{flipped ? 'Show question' : 'Show answer'}<span className="ml-1 hidden sm:inline"><Kbd>Space</Kbd></span>
            </Button>
          </div>
        </>
      )}

      {mode === 'multiple-choice' && mc && (
        <Card className="p-5">
          <Label>Multiple-choice recall</Label>
          {mc.kind === 'names' && <p className="mt-2 text-lg leading-7">{term.plain}</p>}
          <p id="mc-prompt" className={cn('font-semibold leading-6', mc.kind === 'names' ? 'mt-3 text-sm text-muted' : 'mt-2 text-lg')}>{mc.prompt}</p>
          <div role="radiogroup" aria-labelledby="mc-prompt" className="mt-3 space-y-2">
            {mc.choices.map((c, i) => {
              const isRight = i === mc.answerIndex, isSel = picked === i, reveal = picked !== null;
              return (
                <button key={i} type="button" role="radio" aria-checked={isSel} disabled={reveal} onClick={() => choose(i)} data-testid="mc-choice"
                  className={cn('flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors',
                    !reveal && 'border-border hover:border-primary/50 hover:bg-surface-2',
                    reveal && isRight && 'border-success bg-success/10', reveal && isSel && !isRight && 'border-danger bg-danger/10', reveal && !isSel && !isRight && 'opacity-70')}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold">{'ABCD'[i]}</span>
                  <span className="flex-1">{c}</span>
                  {reveal && isRight && <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="Correct answer" />}
                  {reveal && isSel && !isRight && <XCircle className="h-5 w-5 shrink-0 text-danger" aria-label="Your answer (incorrect)" />}
                </button>
              );
            })}
          </div>
          <div aria-live="polite">{picked !== null && <Feedback ok={correct === true} term={term} extra={mc.explanation} />}</div>
        </Card>
      )}

      {mode === 'typed' && (
        <Card className="p-5">
          <Label>Type the term that matches this definition</Label>
          <p className="mt-2 text-lg leading-7">{term.plain}</p>
          <form onSubmit={checkTyped} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="typed-answer">Your answer</label>
            <input id="typed-answer" ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)} disabled={revealed} autoComplete="off" autoCapitalize="off" spellCheck={false}
              placeholder="Type the term…" data-testid="typed-input" className="h-11 flex-1 rounded-lg border border-border bg-surface px-3 text-base text-fg placeholder:text-muted disabled:opacity-70" />
            {!revealed && (
              <div className="flex gap-2">
                <Button type="submit" disabled={!typed.trim()} data-testid="typed-check">Check</Button>
                <Button type="button" variant="outline" onClick={giveUp} data-testid="typed-reveal">I don’t know</Button>
              </div>
            )}
          </form>
          <div aria-live="polite">{revealed && <Feedback ok={correct === true} term={term} typed={typed.trim() || undefined} />}</div>
        </Card>
      )}

      {revealed && (
        <div className="mt-5" data-testid="rating-bar">
          <p className="mb-2 text-center text-sm text-muted" id="rate-label">
            {correct === false ? 'Not quite — this card will come back soon.' : 'How well did you remember it?'}
          </p>
          <div role="group" aria-labelledby="rate-label" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RATING_META.map(({ r, label, key }) => {
              const ok = allowed.includes(r);
              return (
                <button key={r} type="button" disabled={!ok || busy} onClick={() => void rate(r)} data-testid={`rate-${r}`}
                  aria-label={`${label}, next review in ${preview[r]}`}
                  className={cn('flex flex-col items-center rounded-xl border px-2 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                    r === 'again' && 'border-danger/50 text-danger enabled:hover:bg-danger/10',
                    r === 'hard' && 'border-warning/50 text-warning enabled:hover:bg-warning/10',
                    r === 'good' && 'border-primary bg-primary text-primary-fg enabled:hover:opacity-90',
                    r === 'easy' && 'border-success/50 text-success enabled:hover:bg-success/10')}>
                  <span>{label}</span>
                  <span className="text-xs font-normal opacity-80">{preview[r]}</span>
                  <span className="mt-0.5 hidden text-[10px] font-normal opacity-60 sm:block">key {key}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-center text-xs text-muted"><Keyboard className="mr-1 inline h-3.5 w-3.5" aria-hidden />Keys 1–4 rate the card{selfGraded ? ', Space flips it' : ''}.</p>
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-wide text-muted">{children}</div>;
}

function Feedback({ ok, term, typed, extra }: { ok: boolean; term: GlossaryTerm; typed?: string; extra?: string }) {
  return (
    <div className={cn('mt-4 rounded-lg p-3 text-sm leading-6', ok ? 'bg-success/10' : 'bg-danger/10')} data-testid="answer-feedback">
      <div className={cn('mb-1 flex items-center gap-1.5 font-semibold', ok ? 'text-success' : 'text-danger')}>
        {ok ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}{ok ? 'Correct' : 'Not quite'}
      </div>
      {!ok && typed && <div>You typed: <span className="font-medium">{typed}</span></div>}
      <div>Answer: <span className="font-semibold">{term.term}</span>{term.aliases.length > 0 && <span className="text-muted"> (also: {term.aliases.join(', ')})</span>}</div>
      {extra && <div className="mt-1 text-muted">{extra}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ summary
function Summary({ ratings, seconds, onExit }: { ratings: Rating[]; seconds: number; onExit: () => void }) {
  const { reviewed, correctPct } = summarize(ratings);
  const nextDue = useLiveQuery(async () => {
    const all = await db.cards.toArray();
    const dues = all.filter((c) => c.inDeck && getTerm(c.termId)).map((c) => c.srs.due);
    return dues.length ? Math.min(...dues) : null;
  }, []);
  const now = Date.now();
  const mm = Math.floor(seconds / 60), ss = seconds % 60;
  return (
    <div className="mx-auto max-w-2xl text-center" data-testid="session-summary">
      <Trophy className="mx-auto mb-2 h-10 w-10 text-primary" aria-hidden />
      <h2 className="text-2xl font-bold">{reviewed > 0 ? 'Session complete' : 'Session ended'}</h2>
      <p className="mt-1 text-muted">{reviewed > 0 ? 'Your ratings have been saved to your schedule.' : 'No cards were rated, so nothing changed.'}</p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 text-left">
        <Stat label="Reviewed" value={reviewed} />
        <Stat label="Recalled" value={`${correctPct}%`} tone={correctPct >= 80 ? 'success' : correctPct >= 50 ? 'warning' : 'danger'} hint="not rated Again" />
        <Stat label="Time" value={`${mm}:${String(ss).padStart(2, '0')}`} />
        <Stat label="Next due" value={nextDue == null ? '—' : formatDue(nextDue, now)} />
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={onExit} data-testid="back-to-deck">Back to deck</Button>
      </div>
    </div>
  );
}
