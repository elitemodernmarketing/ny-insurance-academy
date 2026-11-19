import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookA, BookOpen, Layers, ListChecks, Timer, Workflow, Target, CheckCircle2, ShieldAlert } from 'lucide-react';
import { content } from '@/content';
import type { Question } from '@/content/schema';
import { getSettings, updateSettings, recordAttempt, addToDeck, newId } from '@/db/repo';
import { useSettings } from '@/db/hooks';
import { markOnboardingCompleted } from './onboardingState';
import { mixedQuiz, choiceOrder } from '@/lib/selection';
import { newSeed } from '@/lib/rng';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { Select } from '@/components/ui/misc';
import { QuestionView, ExplanationPanel, detectConfusion } from '@/components/question/QuestionView';
import { cn } from '@/components/ui/cn';

const STEPS = ['Welcome', 'About you', 'How it works', 'Diagnostic', 'Your starting point'] as const;
const DIAGNOSTIC_SIZE = 12;

/** First-launch onboarding with a short diagnostic quiz. Completing (or skipping) it sets onboardingDone forever. */
export default function OnboardingPage() {
  const nav = useNavigate();
  const settings = useSettings();
  const [step, setStep] = useState(0);
  const seed = useRef(newSeed()).current;
  const sessionId = useRef(newId('diag')).current;
  const questions: Question[] = useMemo(
    () => mixedQuiz(content.questions.filter((q) => q.difficulty <= 2), content.sections, DIAGNOSTIC_SIZE, seed, { exposure: {}, missed: {}, lastSeen: {} }),
    [seed],
  );
  const orders = useMemo(() => Object.fromEntries(questions.map((q) => [q.id, choiceOrder(q.choices.map((c) => c.id), `${sessionId}:${q.id}`)])), [questions, sessionId]);
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState(false);
  const shownAt = useRef(Date.now());

  async function finish(goTo: string) {
    const s = await getSettings();
    await updateSettings({ onboardingDone: true, onboardingDoneAt: s.onboardingDoneAt ?? Date.now() });
    markOnboardingCompleted();
    nav(goTo, { replace: true });
  }

  async function answer(choiceId: string) {
    if (revealed) return;
    const q = questions[qi];
    setAnswers((a) => ({ ...a, [q.id]: choiceId }));
    setRevealed(true);
    await recordAttempt({
      questionId: q.id, sectionId: q.sectionId, concepts: q.concepts, difficulty: q.difficulty, correct: choiceId === q.correct,
      choiceId, confidence: null, responseMs: Date.now() - shownAt.current, mode: 'diagnostic', sessionId,
      confusedWith: detectConfusion(q, choiceId), contentVersion: q.version,
    });
  }
  function next() {
    setRevealed(false);
    shownAt.current = Date.now();
    if (qi + 1 < questions.length) setQi(qi + 1);
    else setStep(4);
  }

  const bySection = useMemo(() => {
    const r: Record<string, { c: number; n: number }> = {};
    for (const q of questions) {
      if (!(q.id in answers)) continue;
      const v = (r[q.sectionId] ??= { c: 0, n: 0 });
      v.n++; if (answers[q.id] === q.correct) v.c++;
    }
    return r;
  }, [answers, questions]);
  const answeredCount = Object.keys(answers).length;
  const correctCount = questions.filter((q) => answers[q.id] === q.correct).length;
  const firstLesson = content.lessons[0];

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="mb-6 flex flex-wrap gap-2" aria-label="Onboarding steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className={cn('rounded-full px-3 py-1 text-xs font-medium', i === step ? 'bg-primary text-primary-fg' : i < step ? 'bg-success/15 text-success' : 'bg-surface-2 text-muted')}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card><CardBody className="space-y-4 pt-6">
          <h1 className="text-3xl font-bold tracking-tight">Welcome to NY Insurance Licensing Academy</h1>
          <p className="text-lg text-muted">A personal study app for the <strong className="text-fg">{content.manifest.title} exam (PSI Series {content.manifest.series})</strong> — built for people starting from zero.</p>
          <ul className="grid gap-2 text-sm sm:grid-cols-3">
            <li className="rounded-lg bg-surface-2 p-3"><div className="text-2xl font-bold">{content.manifest.exam.questionCount}</div>scored questions</li>
            <li className="rounded-lg bg-surface-2 p-3"><div className="text-2xl font-bold">{content.manifest.exam.timeLimitMinutes} min</div>time limit</li>
            <li className="rounded-lg bg-surface-2 p-3"><div className="text-2xl font-bold">{content.manifest.exam.passingPercent}%</div>needed to pass</li>
          </ul>
          <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
            <div>
              <p><strong>Important:</strong> New York requires a 40-hour DFS-approved pre-licensing course (or an exemption) before you can take this exam. This app is independent study — it does <strong>not</strong> issue a School Certificate, and time spent here is not approved course credit.</p>
              <p className="mt-1">Practice scores help you prepare but can't guarantee a real exam result. Content follows the official PSI outline (bulletin updated 4/28/2023); New York rules are shown only when verified against a cited source.</p>
            </div>
          </div>
          <p className="text-sm text-muted">Everything stays on this device. No account, no subscription, works offline.</p>
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" onClick={() => finish('/')} data-testid="onboarding-skip">Skip setup</Button>
            <Button onClick={() => setStep(1)} data-testid="onboarding-next">Get started</Button>
          </div>
        </CardBody></Card>
      )}

      {step === 1 && (
        <Card><CardBody className="space-y-4 pt-6">
          <h1 className="text-2xl font-bold">About you</h1>
          <Select label="How much do you already know about insurance?" value={settings.priorKnowledge} onChange={(e) => updateSettings({ priorKnowledge: e.target.value as 'none' | 'some' | 'experienced' })}>
            <option value="none">Nothing yet — start from the very beginning</option>
            <option value="some">A little (I know basic terms)</option>
            <option value="experienced">I work in or around insurance</option>
          </Select>
          <Select label="Daily study goal" value={String(settings.dailyGoalMinutes)} onChange={(e) => updateSettings({ dailyGoalMinutes: Number(e.target.value) })}>
            {[20, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </Select>
          <Select label="Practice target (buffer above the 70% passing score)" value={String(settings.practiceTarget)} onChange={(e) => updateSettings({ practiceTarget: Number(e.target.value) })}>
            {[75, 80, 85, 90].map((p) => <option key={p} value={p}>{p}%{p === 85 ? ' (recommended)' : ''}</option>)}
          </Select>
          <label className="flex items-start gap-3 rounded-lg bg-surface-2 p-3 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={settings.teachMeNew} onChange={(e) => updateSettings({ teachMeNew: e.target.checked })} />
            <span><strong>Teach Me Like I'm New</strong> — show simpler explanations in lessons wherever available (you can switch this any time).</span>
          </label>
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
            <Button onClick={() => setStep(2)} data-testid="onboarding-next">Continue</Button>
          </div>
        </CardBody></Card>
      )}

      {step === 2 && (
        <Card><CardBody className="space-y-4 pt-6">
          <h1 className="text-2xl font-bold">How the academy works</h1>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: BookOpen, t: 'Lessons', d: 'Every topic in the official outline, in plain English, with activities and knowledge checks.' },
              { icon: BookA, t: 'Insurance Dictionary', d: `${content.terms.length} terms with plain-English definitions, examples, exam traps and comparisons.` },
              { icon: Layers, t: 'Flashcards', d: 'Spaced repetition (SM-2). Missed questions add their concepts automatically.' },
              { icon: ListChecks, t: 'Practice', d: 'Seven modes: learn-and-answer, topic, mixed, weakness drill, rapid fire, tricky, explain-your-answer.' },
              { icon: Timer, t: 'Mock exams', d: `${content.manifest.exam.questionCount} questions, ${content.manifest.exam.timeLimitMinutes} minutes, weighted like the official blueprint. No feedback until you submit.` },
              { icon: Workflow, t: 'Scenarios', d: 'Interactive cases: choosing coverage, deductibles, beneficiaries, policy timelines, NY compliance.' },
              { icon: Target, t: 'Adaptive review', d: 'Tracks every concept and tells you what to study next — and why.' },
            ].map((f) => (
              <li key={f.t} className="flex gap-3 rounded-lg border border-border p-3">
                <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <div><div className="font-semibold">{f.t}</div><div className="text-sm text-muted">{f.d}</div></div>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">Next: a {Math.min(DIAGNOSTIC_SIZE, questions.length)}-question diagnostic. It's fine to guess — it only helps the app find your starting point.</p>
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(4)} data-testid="diagnostic-skip">Skip diagnostic</Button>
              <Button onClick={() => { shownAt.current = Date.now(); setStep(3); }} disabled={!questions.length} data-testid="diagnostic-start">Start diagnostic</Button>
            </div>
          </div>
        </CardBody></Card>
      )}

      {step === 3 && questions[qi] && (
        <Card><CardBody className="pt-6">
          <Progress value={qi + (revealed ? 1 : 0)} max={questions.length} label="Diagnostic progress" className="mb-4" />
          <QuestionView question={questions[qi]} order={orders[questions[qi].id]} selected={answers[questions[qi].id] ?? null} onSelect={(c) => void answer(c)} reveal={revealed} disabled={revealed} keyboard number={qi + 1} total={questions.length} />
          {revealed && <ExplanationPanel question={questions[qi]} order={orders[questions[qi].id]} selected={answers[questions[qi].id] ?? null} />}
          <div className="mt-4 flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep(4)}>End diagnostic</Button>
            <Button onClick={next} disabled={!revealed} data-testid="diagnostic-next">{qi + 1 < questions.length ? 'Next question' : 'See results'}</Button>
          </div>
        </CardBody></Card>
      )}

      {step === 4 && (
        <Card><CardBody className="space-y-4 pt-6">
          <h1 className="text-2xl font-bold">Your starting point</h1>
          {answeredCount === 0 ? (
            <p className="text-muted">No diagnostic answers — no problem. We'll start at the beginning of the outline.</p>
          ) : (
            <>
              <p className="text-lg">You answered <strong>{correctCount} of {answeredCount}</strong> correctly ({Math.round((correctCount / answeredCount) * 100)}%). {correctCount / answeredCount < 0.5 ? 'That is normal before studying — the lessons start from zero.' : 'Nice head start!'}</p>
              <ul className="space-y-1 text-sm">
                {Object.entries(bySection).map(([sid, v]) => (
                  <li key={sid} className="flex items-center justify-between gap-2 rounded bg-surface-2 px-3 py-1.5">
                    <span>{content.sectionById.get(sid as never)?.shortName ?? sid}</span>
                    <span className={cn('font-medium', v.c === v.n ? 'text-success' : v.c === 0 ? 'text-danger' : 'text-warning')}>{v.c}/{v.n}{v.c === v.n ? <CheckCircle2 className="ml-1 inline h-4 w-4" aria-label="all correct" /> : null}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted">Concepts you missed were added to your flashcards automatically.</p>
            </>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={async () => { await addToDeck(content.termsBySection.get('gen')?.slice(0, 15).map((t) => t.id) ?? [], 'onboarding'); await finish('/flashcards'); }}>Add starter flashcards</Button>
            {firstLesson && <Button variant="outline" onClick={() => finish(`/lesson/${firstLesson.id}`)}>Start first lesson</Button>}
            <Button onClick={() => finish('/')} data-testid="onboarding-finish">Go to dashboard</Button>
          </div>
        </CardBody></Card>
      )}
    </div>
  );
}
