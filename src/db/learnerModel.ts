/**
 * The learner model: turns raw progress rows into mastery, section statistics, readiness and recommendations.
 * `buildLearnerModel` is pure (testable); `useLearnerModel` is the live React hook.
 */
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type AttemptRow, type CardRow, type CardReviewRow, type LessonProgressRow, type ExamSessionRow, type StudyLogRow, type Settings } from './db';
import { content } from '@/content';
import { masteryByConcept, sectionMastery, estimateExamScore, type EvidenceEvent, type ConceptMastery } from '@/lib/mastery';
import { statusOf, type CardStatus } from '@/lib/srs';
import { whyNotReady, recommendations, type SectionStat, type ReadinessInput } from '@/lib/readiness';
import { localDate, addDays } from '@/lib/dates';
import { DEFAULT_SETTINGS } from './db';

export interface RawLearnerData {
  attempts: AttemptRow[];
  cards: CardRow[];
  cardReviews: CardReviewRow[];
  lessonProgress: LessonProgressRow[];
  examSessions: ExamSessionRow[];
  studyLog: StudyLogRow[];
  settings: Settings;
}

const BANK_MODES = new Set(['learn', 'topic', 'mixed', 'weakness', 'rapid', 'tricky', 'explain', 'exam', 'lesson-quiz', 'diagnostic', 'review']);

export function buildLearnerModel(raw: RawLearnerData, now = Date.now()) {
  const events: EvidenceEvent[] = [];
  for (const a of raw.attempts) {
    if (a.choiceId === null) continue; // unanswered exam items are not evidence of knowledge either way… but count as wrong in scores
    for (const c of a.concepts)
      events.push({ concept: c, at: a.at, correct: a.correct, guessed: a.confidence === 'guess', difficulty: a.difficulty, source: a.mode === 'glossary' ? 'glossary' : 'question' });
  }
  for (const r of raw.cardReviews) events.push({ concept: r.termId, at: r.at, correct: r.correct, guessed: r.rating === 'hard', difficulty: 2, source: 'flashcard' });
  const mastery = masteryByConcept(events, now);

  const bankAttempts = raw.attempts.filter((a) => BANK_MODES.has(a.mode) && !a.questionId.startsWith('term:') && !a.questionId.startsWith('lesson:'));
  const answersBySection: Record<string, { correct: boolean; at: number }[]> = {};
  for (const a of bankAttempts) (answersBySection[a.sectionId] ??= []).push({ correct: a.correct, at: a.at });

  const completedLessons = new Set(raw.lessonProgress.filter((l) => l.status === 'completed').map((l) => l.lessonId));
  const sectionStats: SectionStat[] = content.sections.map((s) => {
    const recent = (answersBySection[s.id] ?? []).slice().sort((a, b) => b.at - a.at).slice(0, 40);
    const sm = sectionMastery(s.id, content.conceptsBySection.get(s.id) ?? [], mastery);
    const lessons = content.lessonsBySection.get(s.id) ?? [];
    return {
      id: s.id, name: s.shortName, weightPct: s.weightPct,
      accuracy: recent.length ? recent.filter((r) => r.correct).length / recent.length : null,
      answered: (answersBySection[s.id] ?? []).length,
      mastery: sm.score, coverage: sm.coverage,
      lessonsDone: lessons.filter((l) => completedLessons.has(l.id)).length, lessonsTotal: lessons.length,
    };
  });
  const estimate = estimateExamScore(content.sections, answersBySection);

  // Flashcards
  const deck = raw.cards.filter((c) => c.inDeck && content.termById.has(c.termId));
  const cardCounts: Record<CardStatus, number> = { new: 0, learning: 0, review: 0, mature: 0 };
  for (const c of deck) cardCounts[statusOf(c.srs)]++;
  const dueCards = deck.filter((c) => c.srs.due <= now).length;
  const forgotten = deck.filter((c) => c.srs.lapses >= 2).sort((a, b) => b.srs.lapses - a.srs.lapses);

  // Confusions
  const pairCounts = new Map<string, number>();
  for (const a of raw.attempts) {
    if (!a.confusedWith || a.correct) continue;
    for (const c of a.concepts) {
      if (c === a.confusedWith) continue;
      const [x, y] = [c, a.confusedWith].sort();
      pairCounts.set(`${x}|${y}`, (pairCounts.get(`${x}|${y}`) ?? 0) + 1);
    }
  }
  const confusedPairs = [...pairCounts.entries()]
    .map(([k, count]) => { const [a, b] = k.split('|'); return { a, b, aName: content.termById.get(a)?.term ?? a, bName: content.termById.get(b)?.term ?? b, count }; })
    .filter((p) => content.termById.has(p.a) && content.termById.has(p.b))
    .sort((x, y) => y.count - x.count);

  const conceptList: ConceptMastery[] = [...mastery.values()].filter((m) => content.termById.has(m.concept));
  const weakConcepts = conceptList
    .filter((m) => m.level === 'weak' || m.level === 'developing')
    .sort((a, b) => a.score - b.score || b.attempts - a.attempts)
    .map((m) => ({ id: m.concept, name: content.termById.get(m.concept)!.term, score: m.score, attempts: m.attempts }));
  const strongConcepts = conceptList.filter((m) => m.level === 'mastered' || m.level === 'proficient').sort((a, b) => b.score - a.score);

  // Exams
  const submitted = raw.examSessions.filter((e) => e.status === 'submitted' && e.result && (e.track ?? 'ny-17-55') === content.manifest.id).sort((a, b) => a.startedAt - b.startedAt);
  const examHistory = submitted.map((e) => ({ id: e.id, pct: e.result!.pct, at: e.submittedAt ?? e.startedAt, kind: e.kind, size: e.size, passed: e.result!.passed }));

  // Study time
  const today = localDate(now);
  const secondsByDate: Record<string, number> = {};
  const secondsByKind: Record<string, number> = {};
  let totalSeconds = 0;
  for (const r of raw.studyLog) {
    secondsByDate[r.date] = (secondsByDate[r.date] ?? 0) + r.seconds;
    secondsByKind[r.kind] = (secondsByKind[r.kind] ?? 0) + r.seconds;
    totalSeconds += r.seconds;
  }
  const last14 = Array.from({ length: 14 }, (_, i) => { const d = addDays(today, i - 13); return { date: d, minutes: Math.round((secondsByDate[d] ?? 0) / 60) }; });
  // Streak: consecutive days with >= 1 minute of study, ending today (or yesterday if nothing logged yet today).
  let streak = 0;
  for (let i = (secondsByDate[today] ?? 0) >= 60 ? 0 : 1; i < 3650; i++) {
    if ((secondsByDate[addDays(today, -i)] ?? 0) >= 60) streak++;
    else break;
  }

  const correctAnswers = bankAttempts.filter((a) => a.correct).length;
  const guessedCorrect = bankAttempts.filter((a) => a.correct && a.confidence === 'guess').length;
  const readinessInput: ReadinessInput = {
    sections: sectionStats,
    examHistory: examHistory.map((e) => ({ pct: e.pct, at: e.at, kind: e.kind })),
    practiceTarget: raw.settings.practiceTarget,
    passingPercent: content.manifest.exam.passingPercent,
    examSize: content.manifest.exam.questionCount, dueCards, totalAnswered: bankAttempts.length, guessedCorrect, correctAnswers, confusedPairs, weakConcepts,
  };
  const readiness = whyNotReady(readinessInput);
  const nextLessonObj = content.lessons.find((l) => !completedLessons.has(l.id));
  const nextLesson = nextLessonObj ? { id: nextLessonObj.id, title: nextLessonObj.title, sectionName: content.sectionById.get(nextLessonObj.sectionId)!.shortName } : undefined;
  const recs = recommendations({ ...readinessInput, nextLesson });

  // Accuracy trend: per-day accuracy over bank attempts (last 30 days with data)
  const byDay = new Map<string, { c: number; n: number }>();
  for (const a of bankAttempts) { const d = localDate(a.at); const v = byDay.get(d) ?? { c: 0, n: 0 }; v.n++; if (a.correct) v.c++; byDay.set(d, v); }
  const accuracyTrend = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([date, v]) => ({ date, pct: Math.round((v.c / v.n) * 100), answered: v.n }));

  return {
    now, mastery, conceptList, weakConcepts, strongConcepts, sectionStats, estimate,
    deck, cardCounts, dueCards, forgotten, confusedPairs,
    examHistory, completedLessons,
    curriculum: { done: completedLessons.size, total: content.lessons.length },
    termsLearned: strongConcepts.length,
    conceptsTotal: content.terms.length,
    study: { totalSeconds, todaySeconds: secondsByDate[today] ?? 0, last14, secondsByKind, streak, secondsByDate },
    bankAnswered: bankAttempts.length, correctAnswers, guessedCorrect,
    practiceAccuracy: bankAttempts.length ? correctAnswers / bankAttempts.length : null,
    accuracyTrend,
    readiness, recommendations: recs, nextLesson,
  };
}
export type LearnerModel = ReturnType<typeof buildLearnerModel>;

/** Live learner model; undefined while loading. Re-computes when any underlying table changes. */
export function useLearnerModel(): LearnerModel | undefined {
  const raw = useLiveQuery(async () => {
    const [attempts, cards, cardReviews, lessonProgress, examSessions, studyLog, settings] = await Promise.all([
      db.attempts.toArray(), db.cards.toArray(), db.cardReviews.toArray(), db.lessonProgress.toArray(),
      db.examSessions.toArray(), db.studyLog.toArray(), db.settings.get('app'),
    ]);
    return { attempts, cards, cardReviews, lessonProgress, examSessions, studyLog, settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) } } as RawLearnerData;
  }, []);
  // Recompute at most once per minute for time-based decay; data changes trigger recompute via `raw`.
  const minute = Math.floor(Date.now() / 60_000);
  return useMemo(() => (raw ? buildLearnerModel(raw) : undefined), [raw, minute]);
}
