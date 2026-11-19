/** Recommendations and "Why am I not ready?" — transparent, rule-based. */
export interface SectionStat {
  id: string; name: string; weightPct: number;
  accuracy: number | null; // recent accuracy 0..1, null if no answers
  answered: number;
  mastery: number; // 0..1
  coverage: number; // 0..1 concepts seen
  lessonsDone: number; lessonsTotal: number;
}
export interface ReadinessInput {
  sections: SectionStat[];
  examHistory: { pct: number; at: number; kind: 'full' | 'custom' }[];
  practiceTarget: number; // e.g. 85
  passingPercent: number; // 70
  dueCards: number;
  totalAnswered: number;
  guessedCorrect: number;
  correctAnswers: number;
  confusedPairs: { a: string; b: string; aName: string; bName: string; count: number }[];
  weakConcepts: { id: string; name: string; score: number; attempts: number }[];
  /** Scored questions on the official exam (default 150). */
  examSize?: number;
}
export type Severity = 'high' | 'medium' | 'low';
export interface Finding { id: string; severity: Severity; title: string; evidence: string; action: { label: string; to: string } }

export function whyNotReady(i: ReadinessInput): { ready: boolean; findings: Finding[] } {
  const f: Finding[] = [];
  const fulls = i.examHistory.filter((e) => e.kind === 'full').sort((a, b) => b.at - a.at);
  if (i.totalAnswered < 150)
    f.push({ id: 'data', severity: 'high', title: 'Not enough practice data yet', evidence: `You have answered ${i.totalAnswered} questions. Readiness estimates need at least 150 answers across all sections.`, action: { label: 'Mixed practice', to: '/practice?mode=mixed' } });
  if (!fulls.length)
    f.push({ id: 'no-full', severity: 'high', title: 'No full-length mock exam taken', evidence: 'The real exam is a full-length, timed test. Take at least two full mock exams to test stamina and pacing.', action: { label: 'Start full mock exam', to: '/exam' } });
  else {
    const last2 = fulls.slice(0, 2);
    const below = last2.filter((e) => e.pct < i.practiceTarget);
    if (below.length)
      f.push({ id: 'exam-below-target', severity: last2.some((e) => e.pct < i.passingPercent) ? 'high' : 'medium', title: `Recent full exams below your ${i.practiceTarget}% target`, evidence: `Last full exam scores: ${last2.map((e) => `${e.pct}%`).join(', ')}. Official passing score is ${i.passingPercent}%.`, action: { label: 'Review missed questions', to: '/review' } });
  }
  const losers = i.sections
    .map((s) => ({ s, acc: s.accuracy ?? 0, lost: (s.weightPct / 100) * (i.examSize ?? 150) * Math.max(0, i.practiceTarget / 100 - (s.accuracy ?? 0)) }))
    .filter((x) => x.s.accuracy === null || x.acc < i.practiceTarget / 100)
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 4);
  for (const x of losers) {
    const sev: Severity = x.s.accuracy === null || x.acc < i.passingPercent / 100 ? (x.s.weightPct >= 6 ? 'high' : 'medium') : 'low';
    f.push({
      id: `sec-${x.s.id}`, severity: sev,
      title: `${x.s.name} (${x.s.weightPct}% of exam)`,
      evidence: x.s.accuracy === null
        ? `No practice answers yet; ${x.s.lessonsDone}/${x.s.lessonsTotal} lessons complete. Worth about ${Math.round((x.s.weightPct * (i.examSize ?? 150)) / 100)} exam questions.`
        : `Recent accuracy ${Math.round(x.acc * 100)}% over ${x.s.answered} answers — roughly ${x.lost.toFixed(1)} questions below your target on a full exam.`,
      action: x.s.lessonsDone < x.s.lessonsTotal ? { label: 'Continue lessons', to: `/learn/${x.s.id}` } : { label: 'Topic quiz', to: `/practice?mode=topic&section=${x.s.id}` },
    });
  }
  if (i.dueCards > 20) f.push({ id: 'due', severity: 'medium', title: `${i.dueCards} flashcards overdue`, evidence: 'Overdue reviews are when forgetting happens. Clearing them protects what you already learned.', action: { label: 'Review flashcards', to: '/flashcards' } });
  if (i.correctAnswers >= 20 && i.guessedCorrect / i.correctAnswers > 0.2)
    f.push({ id: 'guessing', severity: 'medium', title: 'Many correct answers were guesses', evidence: `${Math.round((i.guessedCorrect / i.correctAnswers) * 100)}% of your correct answers were marked as guesses — those concepts are scheduled for re-review.`, action: { label: 'Weakness drill', to: '/practice?mode=weakness' } });
  for (const p of i.confusedPairs.slice(0, 2))
    f.push({ id: `confuse-${p.a}-${p.b}`, severity: 'low', title: `You mix up "${p.aName}" and "${p.bName}"`, evidence: `Confused ${p.count} time(s). A side-by-side comparison usually fixes this quickly.`, action: { label: 'Compare terms', to: `/dictionary/compare?a=${p.a}&b=${p.b}` } });
  if (i.weakConcepts.length)
    f.push({ id: 'weak-concepts', severity: 'low', title: 'Weakest concepts', evidence: i.weakConcepts.slice(0, 5).map((c) => `${c.name} (${Math.round(c.score * 100)}%)`).join(', '), action: { label: 'Weakness drill', to: '/practice?mode=weakness' } });
  const order = { high: 0, medium: 1, low: 2 };
  f.sort((a, b) => order[a.severity] - order[b.severity]);
  const ready = !f.some((x) => x.severity === 'high') && fulls.length >= 2 && fulls.slice(0, 2).every((e) => e.pct >= i.practiceTarget);
  return { ready, findings: f };
}

export interface Recommendation { id: string; title: string; reason: string; to: string; label: string }

/** Top study recommendations for the dashboard, each with a plain-language reason. */
export function recommendations(i: ReadinessInput & { nextLesson?: { id: string; title: string; sectionName: string } }): Recommendation[] {
  const r: Recommendation[] = [];
  if (i.dueCards > 0) r.push({ id: 'cards', title: `Review ${i.dueCards} due flashcard${i.dueCards > 1 ? 's' : ''}`, reason: 'These cards are scheduled for today by the spaced-repetition algorithm; reviewing on time is the cheapest way to retain them.', to: '/flashcards', label: 'Start review' });
  if (i.nextLesson) r.push({ id: 'lesson', title: `Continue: ${i.nextLesson.title}`, reason: `Next unfinished lesson in ${i.nextLesson.sectionName}, following the exam outline order.`, to: `/lesson/${i.nextLesson.id}`, label: 'Open lesson' });
  const p = i.confusedPairs[0];
  if (p) r.push({ id: 'compare', title: `Compare "${p.aName}" vs "${p.bName}"`, reason: `You picked one when the answer was the other ${p.count} time(s).`, to: `/dictionary/compare?a=${p.a}&b=${p.b}`, label: 'Compare' });
  const w = i.weakConcepts.filter((c) => c.attempts >= 2)[0];
  if (w) r.push({ id: 'weak', title: 'Weakness drill', reason: `Lowest mastery: ${w.name} at ${Math.round(w.score * 100)}% after ${w.attempts} attempts.`, to: '/practice?mode=weakness', label: 'Drill' });
  const studied = i.sections.filter((s) => s.lessonsDone > 0);
  const fulls = i.examHistory.filter((e) => e.kind === 'full');
  if (studied.length >= 6 && (!fulls.length || Date.now() - Math.max(...fulls.map((e) => e.at)) > 7 * 86_400_000))
    r.push({ id: 'exam', title: 'Take a full mock exam', reason: fulls.length ? 'It has been over a week since your last full mock exam.' : 'You have studied enough sections to benefit from a realistic timed exam.', to: '/exam', label: 'Start exam' });
  return r.slice(0, 5);
}
