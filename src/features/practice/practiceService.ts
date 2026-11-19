/**
 * Practice session logic (no React). Selection → session row → answers → summary.
 * Every answer is recorded with recordAttempt() and persisted to the practiceSessions row in one transaction,
 * so reloading the page resumes exactly where the learner stopped.
 */
import { content, termName } from '@/content';
import type { Question } from '@/content/schema';
import { db, type PracticeMode, type PracticeSessionRow, type Confidence } from '@/db/db';
import { newId, recordAttempt } from '@/db/repo';
import { detectConfusion } from '@/components/question/QuestionView';
import { choiceOrder, topicQuiz, mixedQuiz, weaknessDrill, rapidFire, trickyQuestions, type History } from '@/lib/selection';
import { gradeExplanation, conceptRubric, type RubricPoint, type RubricResult } from '@/lib/rubric';
import type { ConceptMastery } from '@/lib/mastery';
import { bankQuestion } from './bank';

export const SETUP_MODES = ['learn', 'topic', 'mixed', 'weakness', 'rapid', 'tricky', 'explain'] as const;
export type SetupMode = (typeof SETUP_MODES)[number];
export function isSetupMode(x: string | null | undefined): x is SetupMode {
  return !!x && (SETUP_MODES as readonly string[]).includes(x);
}

export const MODE_META: Record<SetupMode, { letter: string; title: string; blurb: string }> = {
  learn: { letter: 'A', title: 'Learn and Answer', blurb: 'One question at a time with full feedback after each answer.' },
  topic: { letter: 'B', title: 'Topic Quiz', blurb: 'Pick one or more sections. Get feedback right away or at the end.' },
  mixed: { letter: 'C', title: 'Mixed Questions', blurb: 'Questions spread across sections by the exam blueprint weights.' },
  weakness: { letter: 'D', title: 'Weakness Drill', blurb: 'Targets questions you missed and concepts with low mastery.' },
  rapid: { letter: 'E', title: 'Rapid Fire', blurb: 'Short, fast questions with an optional countdown and a streak counter.' },
  tricky: { letter: 'F', title: 'Tricky Questions', blurb: 'Negative wording, close distractors and advanced items. See the trap explained.' },
  explain: { letter: 'G', title: 'Explain Your Answer', blurb: 'Answer, then explain why in your own words and get checked against key points.' },
};

export const COUNT_PRESETS = [5, 10, 20, 30] as const;
export const MAX_COUNT = 100;
export const DEFAULT_COUNT: Record<SetupMode, number> = { learn: 10, topic: 10, mixed: 20, weakness: 10, rapid: 20, tricky: 10, explain: 5 };

export type Difficulty = 1 | 2 | 3;
export interface PracticeConfig {
  feedback: 'immediate' | 'end';
  count: number;
  sectionIds: string[];
  difficulty: Difficulty[];
  /** Rapid fire per-question countdown in seconds; 0 = off. */
  countdownSec: number;
  seed: number;
}

export function defaultConfig(mode: SetupMode, seed: number): PracticeConfig {
  return { feedback: 'immediate', count: DEFAULT_COUNT[mode], sectionIds: [], difficulty: [], countdownSec: 0, seed };
}

export interface SelectionContext {
  pool: Question[];
  sections: { id: string; weightPct: number }[];
  mastery: Map<string, ConceptMastery>;
  history: History;
}
export interface Selection {
  questions: Question[];
  /** Why each question was chosen (weakness drill). */
  reasons: Record<string, string>;
  requested: number;
  /** Questions that could have been chosen for this mode/filters (>= questions.length). */
  available: number;
}

/** Replace raw concept ids in selection.ts reason strings with the glossary term names. */
function prettyReason(reason: string): string {
  return reason.replace(/Concept "([a-z0-9-]+)"/, (_m, id: string) => `Concept "${termName(id)}"`);
}

export function selectQuestions(mode: SetupMode, cfg: PracticeConfig, ctx: SelectionContext): Selection {
  const { pool, sections, mastery, history: h } = ctx;
  const count = Math.max(0, Math.floor(cfg.count));
  const diff = cfg.difficulty.length ? cfg.difficulty : undefined;
  const bySections = (mode === 'topic' || mode === 'learn' || mode === 'explain') && cfg.sectionIds.length > 0;
  let questions: Question[] = [];
  let available = 0;
  const reasons: Record<string, string> = {};

  if (mode === 'topic' || bySections) {
    if (mode === 'topic' && cfg.sectionIds.length === 0) return { questions: [], reasons, requested: count, available: 0 };
    const all = topicQuiz(pool, cfg.sectionIds, Infinity, cfg.seed, h, mode === 'topic' ? diff : undefined);
    available = all.length;
    questions = all.slice(0, count);
  } else if (mode === 'weakness') {
    const all = weaknessDrill(pool, mastery, Infinity, cfg.seed, h);
    available = all.length;
    for (const r of all.slice(0, count)) { questions.push(r.question); reasons[r.question.id] = prettyReason(r.reason); }
  } else if (mode === 'rapid') {
    const all = rapidFire(pool, Infinity, cfg.seed, h);
    available = all.length; questions = all.slice(0, count);
  } else if (mode === 'tricky') {
    const all = trickyQuestions(pool, Infinity, cfg.seed, h);
    available = all.length; questions = all.slice(0, count);
  } else {
    // mixed, and learn/explain across all sections: blueprint-weighted
    const d = mode === 'mixed' ? diff : undefined;
    available = pool.filter((q) => !d || d.includes(q.difficulty)).length;
    questions = mixedQuiz(pool, sections, Math.min(count, available), cfg.seed, h, d);
  }
  return { questions, reasons, requested: count, available };
}

export function sessionTitle(mode: PracticeMode, cfg: Pick<PracticeConfig, 'sectionIds'>, n: number): string {
  const q = `${n} question${n === 1 ? '' : 's'}`;
  if (mode === 'review') return `Review of missed questions (${q})`;
  const meta = MODE_META[mode as SetupMode];
  if (!meta) return `Practice (${q})`;
  if ((mode === 'topic' || mode === 'learn' || mode === 'explain') && cfg.sectionIds.length) {
    const names = cfg.sectionIds.map((id) => content.sectionById.get(id as never)?.shortName ?? id);
    const label = names.length <= 2 ? names.join(' + ') : `${names.length} sections`;
    return `${meta.title}: ${label} (${q})`;
  }
  return `${meta.title} (${q})`;
}

export interface CreateSessionInput {
  mode: PracticeMode;
  questions: Pick<Question, 'id' | 'choices'>[];
  config: Record<string, unknown>;
  reasons?: Record<string, string>;
  title?: string;
  now?: number;
}

/** Create and persist a practiceSessions row (choice order fixed per question so reloads never reshuffle). */
export async function createPracticeSession(input: CreateSessionInput): Promise<PracticeSessionRow> {
  const id = newId('ps');
  const now = input.now ?? Date.now();
  const choiceOrders: Record<string, string[]> = {};
  for (const q of input.questions) choiceOrders[q.id] = choiceOrder(q.choices.map((c) => c.id), `${id}:${q.id}`);
  const row: PracticeSessionRow = {
    id,
    mode: input.mode,
    title: input.title ?? sessionTitle(input.mode, { sectionIds: (input.config.sectionIds as string[] | undefined) ?? [] }, input.questions.length),
    config: input.config,
    questionIds: input.questions.map((q) => q.id),
    choiceOrders,
    index: 0,
    answers: {},
    reasons: input.reasons && Object.keys(input.reasons).length ? input.reasons : undefined,
    startedAt: now,
    updatedAt: now,
    track: content.manifest.id,
    status: 'in-progress',
  };
  await db.practiceSessions.put(row);
  return row;
}

export async function startPracticeFromSelection(mode: SetupMode, cfg: PracticeConfig, sel: Selection): Promise<PracticeSessionRow> {
  const config: Record<string, unknown> = {
    feedback: mode === 'topic' || mode === 'mixed' ? cfg.feedback : 'immediate',
    count: sel.questions.length, requested: cfg.count, sectionIds: cfg.sectionIds, difficulty: cfg.difficulty,
    countdownSec: mode === 'rapid' ? cfg.countdownSec : 0, seed: cfg.seed,
  };
  return createPracticeSession({ mode, questions: sel.questions, config, reasons: sel.reasons, title: sessionTitle(mode, cfg, sel.questions.length) });
}

/** A new practice session containing the given (eligible) question ids. */
export async function startReviewSession(ids: string[], title?: string): Promise<PracticeSessionRow | null> {
  const questions = ids.map((id) => bankQuestion(id)).filter((q): q is Question => !!q);
  if (!questions.length) return null;
  return createPracticeSession({ mode: 'review', questions, config: { feedback: 'immediate', count: questions.length, sectionIds: [], difficulty: [], countdownSec: 0 }, title: title ?? sessionTitle('review', { sectionIds: [] }, questions.length) });
}

export function feedbackOf(row: Pick<PracticeSessionRow, 'config'>): 'immediate' | 'end' {
  return row.config.feedback === 'end' ? 'end' : 'immediate';
}
export function countdownOf(row: Pick<PracticeSessionRow, 'config'>): number {
  const c = Number(row.config.countdownSec ?? 0);
  return Number.isFinite(c) && c > 0 ? c : 0;
}

// ------------------------------------------------------------------ explain mode
export function rubricFor(q: Question): RubricPoint[] {
  return q.rubric?.keyPoints ?? conceptRubric(q.concepts.map((id) => ({ term: termName(id), aliases: content.termById.get(id)?.aliases })));
}
/** Grade a free-text explanation against the question's authored rubric (or its concept terms). */
export function gradeForQuestion(q: Question, text: string): RubricResult {
  return gradeExplanation(text, rubricFor(q));
}

// ------------------------------------------------------------------ answering
export interface AnswerInput {
  /** null = no answer (e.g. rapid-fire countdown expired). */
  choiceId: string | null;
  confidence: Confidence | null;
  responseMs: number;
  explanation?: string;
}

/**
 * Record one answer: attempt row (+ flashcard side effects) and the session row, atomically.
 * Idempotent per question. With feedback "at end" the session advances immediately and completes after the last answer.
 */
export async function answerQuestion(sessionId: string, questionId: string, input: AnswerInput, now = Date.now()): Promise<PracticeSessionRow> {
  const q = bankQuestion(questionId);
  if (!q) throw new Error(`Question ${questionId} is not available`);
  return db.transaction('rw', db.practiceSessions, db.attempts, db.cards, async () => {
    const row = await db.practiceSessions.get(sessionId);
    if (!row) throw new Error('Practice session not found');
    if (row.answers[questionId]) return row;
    const correct = input.choiceId !== null && input.choiceId === q.correct;
    const text = input.explanation?.trim() || undefined;
    const rubricScore = row.mode === 'explain' && text ? gradeForQuestion(q, text).score : undefined;
    await recordAttempt({
      questionId: q.id, sectionId: q.sectionId, concepts: q.concepts, difficulty: q.difficulty, correct,
      choiceId: input.choiceId, confidence: input.confidence, responseMs: Math.max(0, Math.round(input.responseMs)),
      mode: row.mode, sessionId, at: now,
      confusedWith: input.choiceId ? detectConfusion(q, input.choiceId) : undefined,
      contentVersion: q.version,
      ...(text ? { explanation: text } : {}),
      ...(rubricScore !== undefined ? { rubricScore } : {}),
    });
    const answers = { ...row.answers, [questionId]: { choiceId: input.choiceId ?? '', correct, confidence: input.confidence, ...(text ? { explanation: text } : {}) } };
    const pos = Math.max(0, row.questionIds.indexOf(questionId));
    let index = row.index;
    let status = row.status;
    if (feedbackOf(row) === 'end') {
      index = Math.max(row.index, pos + 1);
      if (row.questionIds.every((id) => answers[id] || !bankQuestion(id))) status = 'completed';
    }
    const next: PracticeSessionRow = { ...row, answers, index, status, updatedAt: now };
    await db.practiceSessions.put(next);
    return next;
  });
}

/** Move to the next question (immediate-feedback modes). Completes the session after the last question. */
export async function advanceSession(sessionId: string, now = Date.now()): Promise<PracticeSessionRow> {
  return db.transaction('rw', db.practiceSessions, async () => {
    const row = await db.practiceSessions.get(sessionId);
    if (!row) throw new Error('Practice session not found');
    const index = row.index + 1;
    const next: PracticeSessionRow = { ...row, index, status: index >= row.questionIds.length ? 'completed' : row.status, updatedAt: now };
    await db.practiceSessions.put(next);
    return next;
  });
}
export async function completeSession(sessionId: string, now = Date.now()): Promise<PracticeSessionRow> {
  return db.transaction('rw', db.practiceSessions, async () => {
    const row = await db.practiceSessions.get(sessionId);
    if (!row) throw new Error('Practice session not found');
    const next: PracticeSessionRow = { ...row, status: 'completed', updatedAt: now };
    await db.practiceSessions.put(next);
    return next;
  });
}
export async function discardSession(sessionId: string): Promise<void> {
  await db.practiceSessions.delete(sessionId);
}

// ------------------------------------------------------------------ progress & summary
export function answeredCount(row: PracticeSessionRow): number {
  return row.questionIds.filter((id) => row.answers[id]).length;
}
export function correctCount(row: PracticeSessionRow): number {
  return row.questionIds.filter((id) => row.answers[id]?.correct).length;
}
/** Current and best run of consecutive correct answers, in question order. */
export function streaks(row: PracticeSessionRow): { current: number; best: number } {
  let cur = 0, best = 0;
  for (const id of row.questionIds) {
    const a = row.answers[id];
    if (!a) break;
    cur = a.correct ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return { current: cur, best };
}

export interface SessionSummary {
  total: number;
  answered: number;
  correct: number;
  incorrect: number;
  pct: number;
  bySection: { sectionId: string; total: number; correct: number; pct: number }[];
  missed: Question[];
  /** Concept term ids whose flashcards were queued by recordAttempt (missed or guessed-correct). */
  queuedConcepts: string[];
  avgRubricPct: number | null;
  bestStreak: number;
}

export function summarizeSession(row: PracticeSessionRow, questions: Question[]): SessionSummary {
  const answered = questions.filter((q) => row.answers[q.id]);
  const correct = answered.filter((q) => row.answers[q.id].correct).length;
  const missed = questions.filter((q) => row.answers[q.id] && !row.answers[q.id].correct);
  const sec = new Map<string, { total: number; correct: number }>();
  for (const q of answered) {
    const s = sec.get(q.sectionId) ?? { total: 0, correct: 0 };
    s.total++; if (row.answers[q.id].correct) s.correct++;
    sec.set(q.sectionId, s);
  }
  const bySection = [...sec.entries()]
    .map(([sectionId, s]) => ({ sectionId, ...s, pct: Math.round((s.correct / s.total) * 100) }))
    .sort((a, b) => a.pct - b.pct || b.total - a.total);
  const queued = new Set<string>();
  for (const q of answered) {
    const a = row.answers[q.id];
    if (!a.correct || a.confidence === 'guess') for (const c of q.concepts) queued.add(c);
  }
  let avgRubricPct: number | null = null;
  if (row.mode === 'explain') {
    const scores = answered.filter((q) => row.answers[q.id].explanation).map((q) => gradeForQuestion(q, row.answers[q.id].explanation!).score);
    if (scores.length) avgRubricPct = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100);
  }
  return {
    total: questions.length, answered: answered.length, correct, incorrect: answered.length - correct,
    pct: answered.length ? Math.round((correct / answered.length) * 100) : 0,
    bySection, missed, queuedConcepts: [...queued], avgRubricPct, bestStreak: streaks(row).best,
  };
}
