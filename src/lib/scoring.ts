/** Exam / quiz scoring. Score = number correct / number of scored questions (unanswered counts as incorrect). */
export interface ScorableQuestion { id: string; sectionId: string; correct: string }
export type Answers = Record<string, string | undefined>;

export interface SectionScore { sectionId: string; total: number; correct: number; incorrect: number; unanswered: number; pct: number }
export interface ExamScore {
  total: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  pct: number; // 0-100, rounded to 1 decimal
  passed: boolean;
  passingPercent: number;
  bySection: SectionScore[];
  missedIds: string[];
}

export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export function scoreExam(questions: ScorableQuestion[], answers: Answers, passingPercent = 70): ExamScore {
  let correct = 0, unanswered = 0;
  const sec = new Map<string, SectionScore>();
  const missedIds: string[] = [];
  for (const q of questions) {
    const s = sec.get(q.sectionId) ?? { sectionId: q.sectionId, total: 0, correct: 0, incorrect: 0, unanswered: 0, pct: 0 };
    s.total++;
    const a = answers[q.id];
    if (a === undefined || a === null || a === '') { unanswered++; s.unanswered++; missedIds.push(q.id); }
    else if (a === q.correct) { correct++; s.correct++; }
    else { s.incorrect++; missedIds.push(q.id); }
    sec.set(q.sectionId, s);
  }
  const total = questions.length;
  const incorrect = total - correct - unanswered;
  const exactPct = total ? (correct / total) * 100 : 0;
  for (const s of sec.values()) s.pct = s.total ? round1((s.correct / s.total) * 100) : 0;
  return {
    total, correct, incorrect, unanswered,
    pct: round1(exactPct),
    // Compare on exact counts, not the rounded percentage: 104/150 = 69.33% fails, 105/150 = 70% passes.
    passed: total > 0 && correct * 100 >= passingPercent * total,
    passingPercent,
    bySection: [...sec.values()].sort((a, b) => a.pct - b.pct),
    missedIds,
  };
}

/** Number of correct answers needed to reach the passing percentage. */
export function correctNeeded(total: number, passingPercent = 70): number {
  return Math.ceil((passingPercent * total) / 100 - 1e-9);
}
